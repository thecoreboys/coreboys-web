import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { MEMBERS } from "@/lib/members";
import { getMediaIntelligenceStore } from "@/lib/media-intelligence/postgres-store";
import { searchMedia } from "@/lib/media-intelligence/search";
import { normalizeText, tokenFuzzySimilarity } from "@/lib/media-intelligence/text";
import type { MediaSearchFacets, MediaSearchHit, SearchContentType, SearchFilters, SearchWatchState } from "@/lib/media-intelligence/types";
import { entitlementDecision, getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { canonicalWatchKey, rankWatchCatalog, watchContentType } from "@/lib/watch/discovery";
import { listProgress } from "@/lib/watch/progress";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORMS = new Set<WatchPlatform>(["twitch", "youtube", "tiktok", "instagram", "x", "house"]);
const FORMATS = new Set<NonNullable<WatchItem["format"]>>(["live", "long", "short", "photo"]);
const CONTENT_TYPES = new Set<SearchContentType>(["live", "broadcast", "video", "short", "clip", "photo", "post"]);
const WATCH_STATES = new Set<SearchWatchState>(["all", "unwatched", "continue", "watched"]);
const SCOPES: Readonly<Record<string, readonly SearchContentType[]>> = {
  live: ["live"], broadcasts: ["broadcast"], videos: ["video"], shorts: ["short"],
  clips: ["clip"], photos: ["photo"], posts: ["post"],
};

type SearchAccess = { semantic: boolean; fuzzyAdvanced: boolean; moments: boolean };
const BASIC_ACCESS: SearchAccess = { semantic: false, fuzzyAdvanced: true, moments: false };

function csv<T extends string>(raw: string | null, allowed: Set<T>): T[] | undefined {
  const values = (raw ?? "").split(",").map((value) => value.trim().toLowerCase())
    .filter((value): value is T => allowed.has(value as T));
  return values.length ? [...new Set(values)] : undefined;
}

function scopes(raw: string | null): SearchContentType[] | undefined {
  const values = (raw ?? "").split(",").flatMap((entry) => SCOPES[entry.trim().toLowerCase()] ?? []);
  return values.length ? [...new Set(values)] : undefined;
}

function finiteNumber(raw: string | null, maximum: number): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, parsed)) : undefined;
}

function dateBoundary(raw: string | null, endOfDay = false): string | undefined {
  if (!raw) return undefined;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : raw;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function privateJson(body: unknown) {
  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

async function resolveSearchContext(request: NextRequest): Promise<{ userId: string | null; access: SearchAccess }> {
  try {
    const userId = await getCurrentFanUserId();
    if (!userId) return { userId: null, access: BASIC_ACCESS };
    const state = await getAccountSubscriptionState({ userId, requestHostname: request.nextUrl.hostname });
    return { userId, access: {
      semantic: entitlementDecision(state, "search.semantic").allowed,
      fuzzyAdvanced: entitlementDecision(state, "search.fuzzy_advanced").allowed,
      moments: entitlementDecision(state, "search.moments").allowed,
    } };
  } catch {
    return { userId: null, access: BASIC_ACCESS };
  }
}

function facetsFor(results: readonly MediaSearchHit[]): MediaSearchFacets {
  const facets: MediaSearchFacets = { platforms: {}, formats: {}, creators: {}, contentTypes: {} };
  for (const hit of results) {
    facets.platforms[hit.item.platform] = (facets.platforms[hit.item.platform] ?? 0) + 1;
    const format = hit.item.format ?? hit.item.kind;
    facets.formats[format] = (facets.formats[format] ?? 0) + 1;
    const creator = hit.item.memberSlug ?? "house";
    facets.creators[creator] = (facets.creators[creator] ?? 0) + 1;
    const contentType = watchContentType(hit.item);
    facets.contentTypes[contentType] = (facets.contentTypes[contentType] ?? 0) + 1;
  }
  return facets;
}

function creatorResults(query: string) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  return MEMBERS.map((member) => {
    const aliases = [member.stageName, member.name, member.slug, member.alias, member.nickname, member.twitchLogin, member.comm.name]
      .filter((value): value is string => Boolean(value));
    const normalizedAliases = aliases.map(normalizeText);
    const exact = normalizedAliases.includes(normalized) ? 1 : 0;
    const prefix = normalizedAliases.some((alias) => alias.startsWith(normalized) || normalized.startsWith(alias)) ? 0.9 : 0;
    const fuzzy = Math.max(0, ...normalizedAliases.map((alias) => tokenFuzzySimilarity(normalized, alias)));
    return {
      key: `creator:${member.slug}`, type: "creator" as const, slug: member.slug,
      label: member.stageName, portrait: member.portrait, community: member.comm.name,
      href: `/channels/${member.slug}`, aliases, score: Math.max(exact, prefix, fuzzy * 0.8),
    };
  }).filter((result) => result.score >= 0.55)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function capabilityContract(access: SearchAccess, watchProgressAvailable: boolean, enhanced: boolean) {
  return {
    ...access,
    exactRanking: true,
    aliases: true,
    typoTolerance: true,
    filters: { platform: true, format: true, scope: true, member: true, date: true, duration: true, watchState: watchProgressAvailable },
    applied: { semantic: enhanced && access.semantic, moments: enhanced && access.moments, fuzzy: true, aliases: true },
  };
}

function catalogHits(items: readonly WatchItem[], query: string, filters: SearchFilters, liveFirst: boolean): MediaSearchHit[] {
  return rankWatchCatalog({ items, query, filters, liveFirst }).map((result) => ({
    key: result.key,
    item: result.item,
    score: result.score,
    scoreBreakdown: result.scoreBreakdown!,
    matchedTerms: result.matchedTerms ?? [],
    evidence: "",
    moment: result.moment ? { startSeconds: result.moment.seconds, endSeconds: null, label: result.moment.title } : null,
  }));
}

function buildResponse(input: {
  query: string; mode: "basic" | "enhanced"; catalogCount: number; indexed: number;
  stats?: { assets: number; revisions: number; segments: number; embeddings: number };
  provider: string; model: string; startedAt: number; allResults: MediaSearchHit[]; limit: number;
  total?: number;
  facets?: MediaSearchFacets; creators: ReturnType<typeof creatorResults>; filters: SearchFilters;
  access: SearchAccess; watchProgressAvailable: boolean; enhancementUnavailable?: boolean;
}) {
  const stats = input.stats;
  const results = input.allResults.slice(0, input.limit);
  return {
    query: input.query, mode: input.mode, total: input.total ?? input.allResults.length, returned: results.length,
    indexed: input.indexed, provider: input.provider, model: input.model,
    tookMs: Math.round((performance.now() - input.startedAt) * 10) / 10,
    results, creators: input.creators, facets: input.facets ?? facetsFor(input.allResults),
    filters: { ...input.filters, progressByRef: undefined },
    coverage: {
      catalogAssets: input.catalogCount,
      indexedAssets: stats?.assets ?? null,
      indexedSegments: stats?.segments ?? null,
      embeddedSegments: stats?.embeddings ?? null,
      indexedRatio: stats
        ? input.catalogCount ? Number(Math.min(1, stats.assets / input.catalogCount).toFixed(4)) : 0
        : null,
      deepAnalyzedAssets: null,
    },
    capabilities: capabilityContract(input.access, input.watchProgressAvailable, input.mode === "enhanced"),
    enhancementUnavailable: input.enhancementUnavailable ?? false,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 240);
  const limit = Math.max(1, Math.min(Number(params.get("limit")) || 24, 60));
  const liveFirst = params.get("liveFirst") !== "false";
  const requestedMode = params.get("mode") === "enhanced" ? "enhanced" : "basic";
  const contentTypes = csv(params.get("contentType"), CONTENT_TYPES) ?? scopes(params.get("scope"));
  const watchState = csv(params.get("watchState"), WATCH_STATES)?.[0] ?? "all";
  const context = await resolveSearchContext(request);
  let progressByRef: SearchFilters["progressByRef"];
  let watchProgressAvailable = false;
  if (context.userId && watchState !== "all") {
    try {
      progressByRef = Object.fromEntries((await listProgress(context.userId)).map((mark) => [mark.ref, mark]));
      watchProgressAvailable = true;
    } catch {
      progressByRef = {};
    }
  } else if (context.userId) {
    watchProgressAvailable = true;
  }
  const filters: SearchFilters = {
    platforms: csv(params.get("platform"), PLATFORMS), formats: csv(params.get("format"), FORMATS),
    contentTypes, memberSlug: params.get("member")?.trim().toLowerCase().slice(0, 80) || undefined,
    liveOnly: params.get("liveOnly") === "true",
    publishedAfter: dateBoundary(params.get("dateFrom") ?? params.get("publishedAfter")),
    publishedBefore: dateBoundary(params.get("dateTo") ?? params.get("publishedBefore"), true),
    minDurationSeconds: finiteNumber(params.get("minDuration") ?? params.get("minDurationSeconds"), 7 * 86_400),
    maxDurationSeconds: finiteNumber(params.get("maxDuration") ?? params.get("maxDurationSeconds"), 7 * 86_400),
    watchState, progressByRef,
  };
  const catalog = await getWatchCatalog();
  const catalogCount = new Set(catalog.all.map(canonicalWatchKey)).size;
  const creators = creatorResults(query);

  if (requestedMode === "basic" || !context.access.semantic) {
    const allResults = catalogHits(catalog.all, query, filters, liveFirst);
    return privateJson(buildResponse({
      query, mode: "basic", catalogCount, indexed: 0, provider: "catalog", model: "catalog-hybrid-v2",
      startedAt, allResults, limit, creators, filters, access: context.access, watchProgressAvailable,
    }));
  }

  try {
    const [search, stats] = await Promise.all([
      searchMedia({ query, limit: 60, liveFirst, filters }), getMediaIntelligenceStore().stats(),
    ]);
    if (stats.assets === 0) throw new Error("empty_media_index");
    const allResults = search.results.map((hit) => ({
      ...hit, key: canonicalWatchKey(hit.item), moment: context.access.moments ? hit.moment : null,
    }));
    return privateJson(buildResponse({
      query, mode: "enhanced", catalogCount, indexed: stats.assets, stats,
      provider: search.provider, model: search.model, startedAt, allResults, limit,
      total: search.total, facets: search.facets, creators, filters, access: context.access, watchProgressAvailable,
    }));
  } catch {
    const allResults = catalogHits(catalog.all, query, filters, liveFirst);
    return privateJson(buildResponse({
      query, mode: "basic", catalogCount, indexed: 0, provider: "catalog", model: "catalog-hybrid-v2",
      startedAt, allResults, limit, creators, filters, access: context.access,
      watchProgressAvailable, enhancementUnavailable: true,
    }));
  }
}
