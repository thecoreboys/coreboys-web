import type { WatchItem } from "./types";
import type { WatchFeedbackEntry } from "./discovery-state";
import type {
  SearchContentType,
  SearchFilters,
  SearchProgressMark,
  SearchScoreBreakdown,
} from "../media-intelligence/types";
import {
  expandConcepts,
  matchedQueryTerms,
  normalizeText,
  textTokens,
  tokenFuzzySimilarity,
} from "../media-intelligence/text";
import { isContinueWatchingMark } from "./continue-watching";

export type WatchMood = "all" | "hype" | "funny" | "chill" | "live" | "deep-dive";
export type WatchSessionLength = "all" | "quick" | "half-hour" | "episode" | "marathon";

export type WatchSearchResult = {
  key: string;
  item: WatchItem;
  score: number;
  scoreBreakdown?: SearchScoreBreakdown;
  moment?: { title: string; seconds: number };
  /** Human-readable reason supplied by the durable media index. */
  evidence?: string;
  /** Normalized query concepts that matched this item. */
  matchedTerms?: string[];
};

const SYNONYMS: Record<string, string[]> = {
  funny: ["funny", "laugh", "comedy", "joke", "prank", "clip", "moment"],
  hype: ["hype", "challenge", "versus", "vs", "win", "crazy", "live"],
  chill: ["chill", "vlog", "house", "talk", "chat", "day", "behind"],
  food: ["food", "eat", "taste", "cook", "restaurant"],
  gaming: ["gaming", "game", "play", "among", "fortnite", "minecraft"],
  short: ["short", "reel", "tiktok", "clip", "moment"],
  stream: ["stream", "live", "broadcast", "vod", "replay"],
};

function clean(value: string) {
  return normalizeText(value);
}

function itemChapters(item: WatchItem) {
  const candidate = item as WatchItem & {
    chapters?: Array<{ title?: string; seconds?: number; startSeconds?: number }>;
  };
  return Array.isArray(candidate.chapters) ? candidate.chapters : [];
}

export function canonicalWatchKey(item: Pick<WatchItem, "platform" | "id">): string {
  return `${item.platform}:${item.id}`;
}

export function watchContentType(item: WatchItem): SearchContentType {
  if (item.kind === "live" || item.format === "live") return "live";
  if (item.kind === "vod") return "broadcast";
  if (item.kind === "clip") return "clip";
  if (item.format === "photo") return "photo";
  if (item.kind === "post") return "post";
  if (item.format === "short") return "short";
  return "video";
}

function knownDurationSeconds(item: WatchItem): number | null {
  if (typeof item.durationSeconds === "number" && Number.isFinite(item.durationSeconds)) {
    return Math.max(0, item.durationSeconds);
  }
  const raw = item.duration?.trim();
  if (!raw) return item.format === "photo" ? 0 : null;
  const parts = raw.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function progressForItem(
  item: WatchItem,
  progress: Readonly<Record<string, SearchProgressMark | undefined>> | undefined,
): SearchProgressMark | null {
  if (!progress) return null;
  const marks = [progress[canonicalWatchKey(item)], progress[item.id]].filter(
    (mark): mark is SearchProgressMark => Boolean(mark),
  );
  if (!marks.length) return null;
  return {
    completed: marks.some((mark) => mark.completed || (mark.progress ?? 0) >= 0.9),
    progress: Math.max(0, ...marks.map((mark) => mark.progress ?? 0)),
    seconds: Math.max(0, ...marks.map((mark) => mark.seconds ?? 0)),
    positionUpdatedAt: marks.sort((left, right) =>
      Date.parse(right.positionUpdatedAt ?? right.updatedAt ?? "0") -
      Date.parse(left.positionUpdatedAt ?? left.updatedAt ?? "0"),
    )[0]?.positionUpdatedAt,
    updatedAt: marks.sort((left, right) =>
      Date.parse(right.updatedAt ?? "0") - Date.parse(left.updatedAt ?? "0"),
    )[0]?.updatedAt,
  };
}

export function matchesSearchFilters(item: WatchItem, filters: SearchFilters): boolean {
  if (filters.platforms?.length && !filters.platforms.includes(item.platform)) return false;
  const format = item.kind === "live" ? "live" : item.format;
  if (filters.formats?.length && (!format || !filters.formats.includes(format))) return false;
  if (filters.contentTypes?.length && !filters.contentTypes.includes(watchContentType(item))) return false;
  if (filters.memberSlug === "house" && item.memberSlug !== null) return false;
  if (filters.memberSlug && filters.memberSlug !== "house" && item.memberSlug !== filters.memberSlug) return false;
  if (filters.liveOnly && watchContentType(item) !== "live") return false;
  const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  if (filters.publishedAfter && (!Number.isFinite(published) || published < Date.parse(filters.publishedAfter))) return false;
  if (filters.publishedBefore && (!Number.isFinite(published) || published > Date.parse(filters.publishedBefore))) return false;
  const duration = knownDurationSeconds(item);
  if (filters.minDurationSeconds != null && (duration == null || duration < filters.minDurationSeconds)) return false;
  if (filters.maxDurationSeconds != null && (duration == null || duration > filters.maxDurationSeconds)) return false;
  const watchState = filters.watchState ?? "all";
  if (watchState !== "all") {
    const mark = progressForItem(item, filters.progressByRef);
    if (watchState === "watched" && !mark?.completed && (mark?.progress ?? 0) < 0.9) return false;
    if (watchState === "continue" && !isContinueWatchingMark(mark)) return false;
    if (watchState === "unwatched" && (mark?.completed || (mark?.progress ?? 0) > 0)) return false;
  }
  return true;
}

export function boundedLiveBoost(relevance: number, live: boolean, enabled = true): number {
  if (!enabled || !live || relevance < 0.35) return 0;
  return Math.min(0.035, 0.015 + (relevance - 0.35) * 0.04);
}

export function catalogMatchSignals(item: WatchItem, query: string) {
  const phrase = clean(query);
  const title = clean(item.title);
  const creator = clean(`${item.memberLabel} ${item.memberSlug ?? ""} ${item.accountLabel ?? ""}`);
  const metadata = clean(`${item.subtitle ?? ""} ${item.platform} ${item.kind} ${item.format ?? ""}`);
  const haystack = `${title} ${creator} ${metadata}`.trim();
  const expanded = expandConcepts(query).map(clean);
  const exact = phrase && title === phrase ? 1 : phrase && title.startsWith(phrase) ? 0.92 : phrase && title.includes(phrase) ? 0.82 : 0;
  const creatorMatch = phrase && creator.split(" ").includes(phrase)
    ? 1
    : phrase && creator.includes(phrase) ? 0.86 : 0;
  const alias = expanded.length
    ? Math.max(0, ...expanded.map((entry) => haystack.includes(entry) ? 0.9 : tokenFuzzySimilarity(entry, haystack) * 0.7))
    : 0;
  const rawTerms = textTokens(query);
  const lexical = !phrase ? 0.2 : rawTerms.length
    ? rawTerms.filter((term) => haystack.split(" ").some((word) => word === term || word.startsWith(term))).length / rawTerms.length
    : haystack.split(" ").includes(phrase) ? 1 : 0;
  const fuzzy = phrase ? tokenFuzzySimilarity(query, haystack) : 0;
  const relevance = Math.max(exact, creatorMatch * 0.9, alias * 0.84, lexical * 0.76, fuzzy * 0.7);
  const tier = exact > 0 ? 4 : creatorMatch > 0 ? 3 : alias >= 0.6 ? 2 : relevance >= 0.42 ? 1 : 0;
  return { exact, creator: creatorMatch, alias, lexical, fuzzy, relevance, tier, haystack };
}

export function rankWatchCatalog(input: {
  items: readonly WatchItem[];
  query: string;
  filters?: SearchFilters;
  liveFirst?: boolean;
}): WatchSearchResult[] {
  const filters = input.filters ?? {};
  const query = input.query.trim();
  const byKey = new Map<string, WatchSearchResult>();
  for (const item of input.items) {
    const key = canonicalWatchKey(item);
    if (!matchesSearchFilters(item, filters)) continue;
    const signals = catalogMatchSignals(item, query);
    if (query && signals.tier === 0) continue;
    const freshness = (() => {
      const timestamp = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
      return Number.isFinite(timestamp) ? Math.exp(-Math.max(0, Date.now() - timestamp) / (90 * 86_400_000)) : 0;
    })();
    const base = query ? Math.min(0.96, signals.tier * 0.19 + signals.relevance * 0.2) : 0.18;
    const live = boundedLiveBoost(signals.relevance, watchContentType(item) === "live", input.liveFirst !== false);
    let moment: WatchSearchResult["moment"];
    for (const chapter of itemChapters(item)) {
      const title = chapter.title?.trim();
      const seconds = chapter.seconds ?? chapter.startSeconds;
      if (query && title && typeof seconds === "number" && tokenFuzzySimilarity(query, title) >= 0.62) {
        moment = { title, seconds };
        break;
      }
    }
    const candidate: WatchSearchResult = {
      key,
      item,
      score: Number(Math.min(1, base + freshness * 0.015 + live).toFixed(6)),
      scoreBreakdown: {
        exact: signals.exact,
        creator: signals.creator,
        alias: signals.alias,
        lexical: signals.lexical,
        fuzzy: signals.fuzzy,
        vector: 0,
        freshness,
        live,
      },
      matchedTerms: matchedQueryTerms(query, signals.haystack),
      moment,
    };
    const existing = byKey.get(key);
    if (
      !existing ||
      candidate.score > existing.score ||
      (candidate.score === existing.score &&
        Date.parse(candidate.item.publishedAt ?? "0") > Date.parse(existing.item.publishedAt ?? "0"))
    ) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    right.score - left.score ||
    Date.parse(right.item.publishedAt ?? "0") - Date.parse(left.item.publishedAt ?? "0") ||
    left.key.localeCompare(right.key),
  );
}

export function searchWatchItems(items: WatchItem[], query: string, limit = 36): WatchSearchResult[] {
  if (!clean(query)) return [];
  return rankWatchCatalog({ items, query }).slice(0, limit);
}

export function itemDurationSeconds(item: WatchItem) {
  // Still images are intentionally a zero-length stop in a session; they can
  // appear in Quick, but never masquerade as a half-hour or deep-dive title.
  if (item.format === "photo") return 0;
  if (item.kind === "live" || item.format === "live") return Number.POSITIVE_INFINITY;
  if (item.durationSeconds && item.durationSeconds > 0) return item.durationSeconds;
  if (item.format === "short") return 90;
  const duration = item.duration?.trim() ?? "";
  if (!duration) return item.kind === "clip" ? 120 : 1_800;
  const parts = duration.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 1_800;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function matchesSessionLength(item: WatchItem, length: WatchSessionLength) {
  if (length === "all") return true;
  // A live room has no known runtime, so a duration promise would be false.
  // Users can still isolate it with the dedicated Live mood/format controls.
  if (item.kind === "live" || item.format === "live") return false;
  const duration = itemDurationSeconds(item);
  if (length === "quick") return duration <= 5 * 60;
  if (length === "half-hour") return duration > 5 * 60 && duration <= 30 * 60;
  if (length === "episode") return duration > 30 * 60 && duration <= 75 * 60;
  return duration > 75 * 60;
}

export function matchesMood(item: WatchItem, mood: WatchMood) {
  if (mood === "all") return true;
  if (mood === "live") return item.kind === "live" || item.format === "live";
  if (mood === "deep-dive") {
    const duration = itemDurationSeconds(item);
    return Number.isFinite(duration) && duration >= 30 * 60;
  }
  const text = clean(`${item.title} ${item.subtitle ?? ""} ${item.kind} ${item.format ?? ""}`);
  if (mood === "funny") return SYNONYMS.funny!.some((word) => text.includes(word));
  if (mood === "hype") return SYNONYMS.hype!.some((word) => text.includes(word));
  return SYNONYMS.chill!.some((word) => text.includes(word)) || item.kind === "post";
}

export function personalizeItems(
  items: WatchItem[],
  feedback: Record<string, WatchFeedbackEntry>,
) {
  return items
    .filter((item) => feedback[item.id]?.value !== "not_interested")
    .map((item, index) => ({
      item,
      index,
      preference: feedback[item.id]?.value === "like" ? 2 : feedback[item.id]?.value === "dislike" ? -1 : 0,
    }))
    .sort((a, b) => b.preference - a.preference || a.index - b.index)
    .map(({ item }) => item);
}
