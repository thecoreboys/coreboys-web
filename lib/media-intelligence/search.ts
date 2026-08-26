import "server-only";
import { cosineSimilarity, getEmbeddingProvider } from "./embedding";
import { expandConcepts, matchedQueryTerms, normalizeText, textTokens, tokenFuzzySimilarity } from "./text";
import { getMediaIntelligenceStore } from "./postgres-store";
import {
  boundedLiveBoost,
  canonicalWatchKey,
  catalogMatchSignals,
  matchesSearchFilters,
  watchContentType,
} from "@/lib/watch/discovery";
import type {
  MediaSearchFacets,
  MediaSearchHit,
  SearchDocument,
  SearchFilters,
  SearchScoreBreakdown,
} from "./types";

const QUERY_EMBEDDING_CACHE_LIMIT = 256;
const queryEmbeddingCache = new Map<string, Promise<number[]>>();

async function cachedQueryEmbedding(
  provider: ReturnType<typeof getEmbeddingProvider>,
  normalizedQuery: string,
): Promise<number[]> {
  const key = `${provider.name}:${provider.model}:${normalizeText(normalizedQuery)}`;
  const existing = queryEmbeddingCache.get(key);
  if (existing) {
    // Refresh insertion order so frequently used entries remain resident.
    queryEmbeddingCache.delete(key);
    queryEmbeddingCache.set(key, existing);
    return existing;
  }
  const promise = provider.embed(normalizedQuery).catch((error) => {
    queryEmbeddingCache.delete(key);
    throw error;
  });
  queryEmbeddingCache.set(key, promise);
  if (queryEmbeddingCache.size > QUERY_EMBEDDING_CACHE_LIMIT) {
    const oldest = queryEmbeddingCache.keys().next().value as string | undefined;
    if (oldest) queryEmbeddingCache.delete(oldest);
  }
  return promise;
}

function lexicalScore(query: string, document: SearchDocument): number {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0.35;
  const aliases = document.aliases.map((entry) => entry.value);
  const haystack = normalizeText([
    document.asset.title,
    document.asset.creatorLabel,
    document.segment.searchDocument,
    ...document.tags,
    ...aliases,
  ].join(" "));
  const terms = textTokens(query);
  const exactPhrase = haystack.includes(normalizedQuery) ? 0.5 : 0;
  const matched = terms.filter((term) => haystack.split(" ").includes(term)).length;
  const coverage = terms.length ? matched / terms.length : 0;
  const titleBoost = normalizeText(document.asset.title).includes(normalizedQuery) ? 0.25 : 0;
  const creatorBoost = document.aliases.some((alias) =>
    alias.weight >= 1.4 && normalizeText(alias.value).includes(normalizedQuery),
  ) ? 0.18 : 0;
  return Math.min(1, exactPhrase + coverage * 0.45 + titleBoost + creatorBoost);
}

function freshnessScore(publishedAt: string | null): number {
  const timestamp = publishedAt ? Date.parse(publishedAt) : NaN;
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.exp(-ageDays / 90);
}

function scoreDocument(
  query: string,
  expandedQuery: string,
  queryVector: number[],
  document: SearchDocument,
  liveFirst: boolean,
): { score: number; breakdown: SearchScoreBreakdown; matchedTerms: string[] } {
  const aliasText = document.aliases.map((alias) => alias.value).join(" ");
  const searchable = `${document.segment.searchDocument} ${document.tags.join(" ")} ${aliasText}`;
  const direct = catalogMatchSignals(document.asset.item, query);
  const lexical = Math.max(direct.lexical, lexicalScore(expandedQuery, document));
  const fuzzy = tokenFuzzySimilarity(query, searchable);
  const vector = Math.max(0, cosineSimilarity(queryVector, document.embedding));
  const freshness = freshnessScore(document.asset.publishedAt);
  const normalizedQuery = normalizeText(query);
  const alias = normalizedQuery
    ? Math.max(
        direct.alias,
        ...document.aliases.map((entry) => {
          const value = normalizeText(entry.value);
          if (value === normalizedQuery) return Math.min(1, entry.weight / 1.4);
          if (value.includes(normalizedQuery)) return Math.min(0.95, entry.weight / 1.6);
          return tokenFuzzySimilarity(normalizedQuery, value) * Math.min(1, entry.weight / 1.4);
        }),
      )
    : 0;
  const relevance = Math.max(
    direct.exact,
    direct.creator * 0.9,
    alias * 0.84,
    lexical * 0.76,
    fuzzy * 0.7,
    vector * 0.68,
  );
  const tier = direct.exact > 0 ? 4 : direct.creator > 0 ? 3 : alias >= 0.6 ? 2 : relevance >= 0.3 ? 1 : 0;
  const base = normalizedQuery ? Math.min(0.96, tier * 0.19 + relevance * 0.2) : 0.18;
  const live = boundedLiveBoost(relevance, document.asset.isLive, liveFirst);
  const score = Math.min(1, base + freshness * 0.015 + live);
  return {
    score,
    breakdown: {
      exact: direct.exact,
      creator: direct.creator,
      alias,
      lexical,
      fuzzy,
      vector,
      freshness,
      live,
    },
    matchedTerms: matchedQueryTerms(query, searchable),
  };
}

export async function searchMedia(input: {
  query: string;
  limit?: number;
  filters?: SearchFilters;
  liveFirst?: boolean;
}): Promise<{
  provider: string;
  model: string;
  results: MediaSearchHit[];
  facets: MediaSearchFacets;
  total: number;
}> {
  const query = input.query.trim().slice(0, 240);
  const expandedQuery = [query, ...expandConcepts(query)].join(" ");
  const provider = getEmbeddingProvider();
  const queryVector = await cachedQueryEmbedding(provider, expandedQuery || "core boys live recent");
  const documents = await getMediaIntelligenceStore().searchDocuments(
    provider.name,
    provider.model,
    input.filters ?? {},
    queryVector,
  );
  const byAsset = new Map<string, MediaSearchHit>();
  for (const document of documents) {
    if (!matchesSearchFilters(document.asset.item, input.filters ?? {})) continue;
    const canonicalKey = canonicalWatchKey(document.asset.item);
    const { score, breakdown, matchedTerms } = scoreDocument(
      query,
      expandedQuery,
      queryVector,
      document,
      input.liveFirst !== false,
    );
    const label = document.segment.title || document.asset.title;
    const hit: MediaSearchHit = {
      key: canonicalKey,
      item: document.asset.item,
      score: Number(score.toFixed(6)),
      scoreBreakdown: {
        exact: Number(breakdown.exact.toFixed(4)),
        creator: Number(breakdown.creator.toFixed(4)),
        alias: Number(breakdown.alias.toFixed(4)),
        lexical: Number(breakdown.lexical.toFixed(4)),
        fuzzy: Number(breakdown.fuzzy.toFixed(4)),
        vector: Number(breakdown.vector.toFixed(4)),
        freshness: Number(breakdown.freshness.toFixed(4)),
        live: Number(breakdown.live.toFixed(4)),
      },
      matchedTerms,
      evidence: document.segment.evidence || `${document.asset.creatorLabel} · ${document.asset.platform}`,
      moment: document.segment.startSeconds != null
        ? {
            startSeconds: document.segment.startSeconds,
            endSeconds: document.segment.endSeconds,
            label,
          }
        : null,
    };
    const existing = byAsset.get(canonicalKey);
    if (!existing || hit.score > existing.score) byAsset.set(canonicalKey, hit);
  }
  const ranked = [...byAsset.values()]
    .filter((hit) => !query || hit.score >= 0.19)
    .sort((left, right) =>
      right.score - left.score ||
      Date.parse(right.item.publishedAt ?? "0") - Date.parse(left.item.publishedAt ?? "0") ||
      left.key.localeCompare(right.key),
    );
  const facets: MediaSearchFacets = { platforms: {}, formats: {}, creators: {}, contentTypes: {} };
  for (const hit of ranked) {
    facets.platforms[hit.item.platform] = (facets.platforms[hit.item.platform] ?? 0) + 1;
    const format = hit.item.format ?? hit.item.kind;
    facets.formats[format] = (facets.formats[format] ?? 0) + 1;
    const creator = hit.item.memberSlug ?? "house";
    facets.creators[creator] = (facets.creators[creator] ?? 0) + 1;
    const contentType = watchContentType(hit.item);
    facets.contentTypes[contentType] = (facets.contentTypes[contentType] ?? 0) + 1;
  }
  const results = ranked.slice(0, Math.max(1, Math.min(input.limit ?? 24, 60)));
  return { provider: provider.name, model: provider.model, results, facets, total: ranked.length };
}
