"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  Clock3,
  CornerDownLeft,
  Image as ImageIcon,
  Lock,
  MessageSquareText,
  Play,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Tv2,
  Users,
  Video,
  X,
} from "lucide-react";
import type { WatchCatalog, WatchItem, WatchPlatform } from "@/lib/watch/types";
import { MEMBERS } from "@/lib/members";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { searchWatchItems, type WatchSearchResult } from "@/lib/watch/discovery";
import { contentShape, itemToPlayable } from "@/lib/watch/playable";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { useSubscription } from "@/hooks/useSubscription";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { hasAnalyticsConsent } from "@/lib/consent";
import { WatchThumb } from "./WatchThumb";

type SearchFilter = "all" | "live" | "videos" | "broadcasts" | "shorts" | "photos" | "posts";
type SearchPlatformFilter = "all" | WatchPlatform;
type SearchCreatorFilter = "all" | "house" | (typeof MEMBERS)[number]["slug"];

type PaletteRow =
  | { key: string; type: "member"; member: (typeof MEMBERS)[number] }
  | { key: string; type: "item"; result: WatchSearchResult };

type DiscoveryGroup =
  | { key: "continue" | "live" | "trending"; title: string; items: WatchItem[] }
  | { key: "recent"; title: string; queries: string[] };

type IndexedSearchResult = {
  item: WatchItem;
  score: number;
  evidence?: string | string[];
  matchedTerms?: string[];
  moment?: { startSeconds: number; endSeconds?: number; label: string } | null;
};

type IndexedSearchResponse = {
  query: string;
  indexed: number;
  provider: string;
  tookMs: number;
  mode?: "basic" | "enhanced";
  results: IndexedSearchResult[];
};

type IndexedSearchState = {
  key: string;
  status: "loading" | "ready" | "fallback";
  indexed: number;
  provider: string;
  tookMs: number;
  results: WatchSearchResult[];
};

const FILTERS: Array<{ id: SearchFilter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "live", label: "Live now" },
  { id: "videos", label: "Videos" },
  { id: "broadcasts", label: "Broadcasts" },
  { id: "shorts", label: "Shorts & reels" },
  { id: "photos", label: "Photos" },
  { id: "posts", label: "Posts" },
];

const PRIMARY_FILTERS = new Set<SearchFilter>(["all", "live", "videos", "shorts"]);
const HIDDEN_CONTENT_FILTERS = FILTERS.filter((option) => !PRIMARY_FILTERS.has(option.id));

const PLATFORM_FILTERS: Array<{ id: SearchPlatformFilter; label: string }> = [
  { id: "all", label: "All platforms" },
  { id: "youtube", label: "YouTube" },
  { id: "twitch", label: "Twitch" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "house", label: "CORE" },
];

const RECENT_SEARCH_LIMIT = 8;
const RECENT_SEARCH_PREFIX = "core.watch.search.recents.v2";
const SEARCH_SEED_SESSION_KEY = "core.watch.search.seed.v1";
const SEARCH_CACHE_LIMIT = 20;
const SEARCH_LIVE_CACHE_MS = 60_000;
const SEARCH_DISCOVERY_CACHE_MS = 5 * 60_000;

type SearchSeedCacheEntry = {
  fetchedAt: number;
  items: WatchItem[];
};

type QueryCacheEntry = {
  fetchedAt: number;
  state: IndexedSearchState;
};

let memorySeedCache: SearchSeedCacheEntry | null = null;
let pendingSeedRequest: Promise<SearchSeedCacheEntry | null> | null = null;
const indexedQueryCache = new Map<string, QueryCacheEntry>();

function isLiveItem(item: WatchItem) {
  return item.kind === "live" || item.format === "live";
}

function cacheLifetime(items: WatchItem[]) {
  return items.some(isLiveItem) ? SEARCH_LIVE_CACHE_MS : SEARCH_DISCOVERY_CACHE_MS;
}

function isCacheFresh(entry: { fetchedAt: number; items?: WatchItem[] }, now = Date.now()) {
  return now - entry.fetchedAt < cacheLifetime(entry.items ?? []);
}

function readSeedCache(): SearchSeedCacheEntry | null {
  if (memorySeedCache) return memorySeedCache;
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(SEARCH_SEED_SESSION_KEY) ?? "null") as Partial<SearchSeedCacheEntry> | null;
    if (!value || !Number.isFinite(value.fetchedAt) || !Array.isArray(value.items)) return null;
    memorySeedCache = { fetchedAt: Number(value.fetchedAt), items: value.items as WatchItem[] };
    return memorySeedCache;
  } catch {
    return null;
  }
}

function writeSeedCache(entry: SearchSeedCacheEntry) {
  memorySeedCache = entry;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SEARCH_SEED_SESSION_KEY, JSON.stringify(entry));
  } catch {
    // Search still works when browser storage is full or disabled.
  }
}

function dedupeItems(items: WatchItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requestSearchSeed() {
  if (pendingSeedRequest) return pendingSeedRequest;
  pendingSeedRequest = fetch("/api/watch/search?q=&limit=60&liveFirst=true&mode=basic", {
    credentials: "same-origin",
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) throw new Error(`global_search_seed_${response.status}`);
    const payload = await response.json() as IndexedSearchResponse;
    const entry = { fetchedAt: Date.now(), items: dedupeItems(payload.results.map((result) => result.item)) };
    writeSeedCache(entry);
    return entry;
  }).catch(() => null).finally(() => {
    pendingSeedRequest = null;
  });
  return pendingSeedRequest;
}

function readQueryCache(key: string) {
  const entry = indexedQueryCache.get(key);
  if (!entry) return null;
  // LRU touch: recently used searches stay around while old queries fall off.
  indexedQueryCache.delete(key);
  indexedQueryCache.set(key, entry);
  return entry;
}

function writeQueryCache(key: string, state: IndexedSearchState) {
  indexedQueryCache.delete(key);
  indexedQueryCache.set(key, { fetchedAt: Date.now(), state });
  while (indexedQueryCache.size > SEARCH_CACHE_LIMIT) {
    const oldestKey = indexedQueryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    indexedQueryCache.delete(oldestKey);
  }
}

function isQueryCacheFresh(key: string, entry: QueryCacheEntry) {
  const [query, scopedFilter] = key.split("\u0000");
  const liveIntent = scopedFilter === "live" || /\b(?:live|streaming|on now)\b/i.test(query ?? "");
  const lifetime = liveIntent
    ? SEARCH_LIVE_CACHE_MS
    : cacheLifetime(entry.state.results.map((result) => result.item));
  return Date.now() - entry.fetchedAt < lifetime;
}

function itemKey(item: WatchItem) {
  return `${item.platform}:${item.id}`;
}

function rowKey(item: WatchItem) {
  return `item-${item.platform}-${item.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function platformLabel(platform: WatchPlatform) {
  return PLATFORM_FILTERS.find((option) => option.id === platform)?.label ?? platform;
}

function PlatformMark({ platform }: { platform: WatchPlatform }) {
  if (platform === "house") return <Tv2 aria-hidden />;
  return <SocialIcon platform={platform} size={13} />;
}

function filterIcon(filter: SearchFilter) {
  if (filter === "live") return <Radio aria-hidden />;
  if (filter === "videos") return <Video aria-hidden />;
  if (filter === "broadcasts") return <Archive aria-hidden />;
  if (filter === "shorts") return <Play aria-hidden />;
  if (filter === "photos") return <ImageIcon aria-hidden />;
  if (filter === "posts") return <MessageSquareText aria-hidden />;
  return null;
}

type SearchAnalyticsPayload = Record<string, string | number | boolean | undefined>;

function trackSearchEvent(name: string, payload: SearchAnalyticsPayload = {}) {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return;
  const analyticsWindow = window as typeof window & {
    gtag?: (command: "event", eventName: string, parameters: SearchAnalyticsPayload) => void;
  };
  analyticsWindow.gtag?.("event", `core_search_${name}`, payload);
}

function latencyBucket(milliseconds: number) {
  if (milliseconds < 100) return "under_100ms";
  if (milliseconds < 300) return "100_299ms";
  if (milliseconds < 1_000) return "300_999ms";
  return "1000ms_plus";
}

function resultCountBucket(count: number) {
  if (count === 0) return "zero";
  if (count <= 5) return "one_to_five";
  if (count <= 20) return "six_to_twenty";
  return "twenty_plus";
}

// Zero-cost bridge until Foundry's one-time media index is connected. These
// aliases turn common fan language into words that exist in provider titles.
const SEARCH_ALIASES: Record<string, string[]> = {
  edate: ["e date", "dating", "20v1", "20 v 1", "20 women", "20 girls", "versus one", "rizz"],
  dating: ["edate", "e date", "20v1", "20 v 1", "20 women", "20 girls", "rizz"],
  date: ["dating", "edate", "e date", "20v1", "20 v 1", "20 women", "20 girls"],
  jshock: ["j shock"],
  twenty: ["20", "20v1"],
  stream: ["live", "broadcast", "vod", "replay"],
  reel: ["short", "tiktok", "clip"],
  reels: ["short", "tiktok", "clip"],
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function conceptScore(item: WatchItem, query: string) {
  const haystack = searchableText(item);
  const raw = rawQueryTerms(query);
  if (!raw.length) return 0;
  let matchedConcepts = 0;
  let score = 0;
  for (const term of raw) {
    const phrases = [term, ...(SEARCH_ALIASES[term] ?? [])].map(normalize);
    const exact = haystack.includes(term);
    const alias = phrases.some((phrase) => phrase !== term && haystack.includes(phrase));
    if (!exact && !alias) continue;
    matchedConcepts += 1;
    score += exact ? 30 : 22;
  }
  // Multi-concept intent should outrank a title that happens to share one
  // broad alias. For example, JShock + e-date strongly favors the JShock
  // 20-girls/rizz programs over an unrelated Jason upload containing "1v1".
  if (raw.length > 1 && matchedConcepts === raw.length) score += 80;
  return score;
}

function editDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= second.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + Number(first[row - 1] !== second[column - 1]),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length] ?? Math.max(first.length, second.length);
}

function canonicalAliasTerm(term: string) {
  if (SEARCH_ALIASES[term]) return term;
  let nearest = term;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.keys(SEARCH_ALIASES)) {
    if (Math.abs(candidate.length - term.length) > 1) continue;
    const distance = editDistance(term, candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= (term.length >= 4 ? 1 : 0) ? nearest : term;
}

function rawQueryTerms(value: string) {
  return normalize(value).split(/\s+/).filter(Boolean).map(canonicalAliasTerm);
}

function queryTerms(value: string) {
  const raw = rawQueryTerms(value);
  return [...new Set(raw.flatMap((term) => [term, ...(SEARCH_ALIASES[term] ?? [])]).flatMap((term) => normalize(term).split(" ")))];
}

function fuzzyTokenScore(needle: string, haystack: string) {
  if (haystack === needle) return 1;
  if (haystack.startsWith(needle) || needle.startsWith(haystack)) return 0.82;
  if (haystack.includes(needle) || needle.includes(haystack)) return 0.72;
  if (needle.length < 3 || haystack.length < 3) return 0;
  const allowance = Math.max(needle.length, haystack.length) > 7 ? 2 : 1;
  const distance = editDistance(needle, haystack);
  return distance <= allowance ? 0.68 - distance * 0.08 : 0;
}

function searchableText(item: WatchItem) {
  return normalize([
    item.title,
    item.subtitle,
    item.accountLabel,
    item.memberLabel,
    item.memberSlug,
    item.platform,
    item.kind,
    item.format,
  ].filter(Boolean).join(" "));
}

function paletteSearch(items: WatchItem[], query: string, limit = 60): WatchSearchResult[] {
  const direct = searchWatchItems(items, query, items.length);
  const directById = new Map(direct.map((result) => [result.item.id, result]));
  const terms = queryTerms(query);
  return items
    .map((item) => {
      const text = searchableText(item);
      const words = text.split(" ");
      const titleWords = normalize(item.title).split(" ");
      let matched = 0;
      let score = normalize(item.title).includes(normalize(query)) ? 40 : 0;
      for (const term of terms) {
        const best = words.reduce((value, word) => Math.max(value, fuzzyTokenScore(term, word)), 0);
        if (best > 0) matched += 1;
        score += best * (titleWords.some((word) => fuzzyTokenScore(term, word) > 0) ? 10 : 6);
      }
      const base = directById.get(item.id);
      if (base) score += base.score * 2;
      score += conceptScore(item, query);
      if (matched === 0 && !base) score = 0;
      return { key: itemKey(item), item, score, moment: base?.moment };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      const live = Number(b.item.kind === "live" || b.item.format === "live")
        - Number(a.item.kind === "live" || a.item.format === "live");
      const liveIntent = /\b(?:live|streaming|on now)\b/i.test(query);
      return b.score - a.score || (liveIntent ? live : 0) || Date.parse(b.item.publishedAt ?? "0") - Date.parse(a.item.publishedAt ?? "0");
    })
    .slice(0, limit);
}

/** Free catalog search: literal title, creator, platform, and format matching. */
function basicPaletteSearch(items: WatchItem[], query: string, limit = 60): WatchSearchResult[] {
  const phrase = normalize(query);
  const terms = phrase.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return items
    .map((item) => {
      const title = normalize(item.title);
      const creator = normalize(`${item.memberLabel ?? ""} ${item.memberSlug ?? ""} ${item.accountLabel ?? ""}`);
      const metadata = normalize(`${item.platform} ${item.kind} ${item.format ?? ""}`);
      const haystack = `${title} ${creator} ${metadata}`;
      const matched = terms.filter((term) => haystack.includes(term)).length;
      if (matched !== terms.length) return { key: itemKey(item), item, score: 0 };
      const score = (title.includes(phrase) ? 40 : 0)
        + (title.startsWith(phrase) ? 20 : 0)
        + terms.reduce((total, term) => total
          + (title.includes(term) ? 10 : creator.includes(term) ? 6 : 3), 0);
      return { key: itemKey(item), item, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      const live = Number(b.item.kind === "live" || b.item.format === "live")
        - Number(a.item.kind === "live" || a.item.format === "live");
      const liveIntent = /\b(?:live|streaming|on now)\b/i.test(query);
      return b.score - a.score || (liveIntent ? live : 0) || Date.parse(b.item.publishedAt ?? "0") - Date.parse(a.item.publishedAt ?? "0");
    })
    .slice(0, limit);
}

function matchesFilter(item: WatchItem, filter: SearchFilter) {
  if (filter === "all") return true;
  if (filter === "live") return item.kind === "live" || item.format === "live";
  if (filter === "broadcasts") return item.kind === "vod";
  if (filter === "shorts") return item.format === "short" || item.kind === "clip";
  if (filter === "photos") return item.format === "photo";
  if (filter === "posts") return item.kind === "post";
  return item.kind !== "post"
    && item.kind !== "vod"
    && item.format !== "short"
    && item.format !== "photo"
    && item.format !== "live"
    && item.kind !== "live"
    && item.kind !== "clip";
}

function scopeForFilter(filter: SearchFilter) {
  if (filter === "all") return null;
  return filter;
}

function normalizedSourceScore(score: number | undefined) {
  if (!Number.isFinite(score)) return 0;
  const value = Math.max(0, score ?? 0);
  return value <= 1 ? value : Math.min(1, value / 100);
}

/**
 * Put local lexical and indexed results onto one deterministic scale. Exact
 * titles and creators get an explicit band above semantic-only matches; the
 * provider score then orders results inside that band. This avoids whichever
 * source happens to resolve first becoming the ranking policy.
 */
function mergeRankedResults(
  localResults: WatchSearchResult[],
  indexedResults: WatchSearchResult[],
  query: string,
  limit = 60,
) {
  const phrase = normalize(query);
  const candidates = new Map<string, { local?: WatchSearchResult; indexed?: WatchSearchResult }>();
  for (const result of localResults) {
    const key = itemKey(result.item);
    candidates.set(key, { ...candidates.get(key), local: result });
  }
  for (const result of indexedResults) {
    const key = itemKey(result.item);
    candidates.set(key, { ...candidates.get(key), indexed: result });
  }

  return [...candidates.entries()].map(([key, sources]) => {
    const item = sources.local?.item ?? sources.indexed!.item;
    const title = normalize(item.title);
    const creator = normalize(`${item.memberLabel ?? ""} ${item.memberSlug ?? ""} ${item.accountLabel ?? ""}`);
    const lexicalBand = !phrase
      ? 0
      : title === phrase
        ? 50
        : title.startsWith(phrase)
          ? 45
          : creator === phrase || creator.split(" ").includes(phrase)
            ? 42
            : creator.includes(phrase)
              ? 38
              : title.includes(phrase)
                ? 34
                : sources.local
                  ? 20
                  : 0;
    const localScore = normalizedSourceScore(sources.local?.score);
    const indexedScore = normalizedSourceScore(sources.indexed?.score);
    const score = lexicalBand + Math.max(localScore, indexedScore) + Math.min(localScore, indexedScore) * 0.1;
    return {
      key,
      item,
      score,
      scoreBreakdown: sources.indexed?.scoreBreakdown ?? sources.local?.scoreBreakdown,
      evidence: sources.indexed?.evidence ?? sources.local?.evidence,
      matchedTerms: sources.indexed?.matchedTerms ?? sources.local?.matchedTerms,
      moment: sources.indexed?.moment ?? sources.local?.moment,
    } satisfies WatchSearchResult;
  }).sort((left, right) =>
    right.score - left.score
    || Date.parse(right.item.publishedAt ?? "0") - Date.parse(left.item.publishedAt ?? "0")
    || left.key.localeCompare(right.key),
  ).slice(0, limit);
}

function formatLabel(item: WatchItem) {
  if (item.kind === "live" || item.format === "live") return "Live";
  if (item.kind === "post") return "Post";
  if (item.format === "photo") return "Photo";
  if (item.format === "short") {
    if (item.platform === "instagram") return "Reel";
    if (item.platform === "youtube") return "Short";
    return "Short video";
  }
  if (item.kind === "vod") return "Past broadcast";
  if (item.kind === "clip") return "Clip";
  return "Video";
}

function relativeDate(value?: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}

function resultDetail(item: WatchItem) {
  if (item.kind === "live" || item.format === "live") {
    const viewers = item.live?.viewers;
    return [
      item.live?.game,
      typeof viewers === "number" ? `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(viewers)} watching` : null,
    ].filter(Boolean).join(" · ");
  }
  return [item.duration, relativeDate(item.publishedAt)].filter(Boolean).join(" · ");
}

function resultAction(item: WatchItem, watched: ReturnType<typeof progressFor>) {
  if (item.kind === "post") return "Open post";
  if (item.format === "photo") return "View photo";
  if (item.kind === "live" || item.format === "live") return "Watch live";
  if (!itemToPlayable(item)) return "Open source";
  if (watched.progress > 0 && !watched.completed) return "Continue";
  return "Play";
}

function progressFor(item: WatchItem, progressMap: ReturnType<typeof useWatchProgress>["map"]) {
  const youtubeId = item.platform === "youtube" ? youtubeIdFromHref(item.href) : null;
  const marks = [item.id, youtubeId].filter(Boolean).map((id) => progressMap[id as string]).filter(Boolean);
  return {
    completed: marks.some((mark) => Boolean(mark?.completed)),
    progress: Math.min(1, Math.max(0, ...marks.map((mark) => mark?.progress ?? 0))),
  };
}

export function WatchPalette({ catalog }: { catalog?: WatchCatalog }) {
  const router = useRouter();
  const player = usePlayer();
  const { user, loading: authLoading } = useAuth();
  const subscription = useSubscription();
  const { map: watchProgress } = useWatchProgress();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<SearchPlatformFilter>("all");
  const [creatorFilter, setCreatorFilter] = useState<SearchCreatorFilter>("all");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [globalSeedItems, setGlobalSeedItems] = useState<WatchItem[]>(() => readSeedCache()?.items ?? []);
  const [seedLoading, setSeedLoading] = useState(() => !catalog && !readSeedCache()?.items.length);
  const [indexedSearch, setIndexedSearch] = useState<IndexedSearchState | null>(null);
  const resultEventKey = useRef<string | null>(null);
  const queryStartedAt = useRef(0);
  const closeTimer = useRef<number | null>(null);

  const warmSearchSeed = useCallback(async () => {
    if (catalog) return;
    const cached = readSeedCache();
    if (cached) setGlobalSeedItems(cached.items);
    if (cached && isCacheFresh(cached)) {
      setSeedLoading(false);
      return;
    }
    if (!cached) setSeedLoading(true);
    const fresh = await requestSearchSeed();
    if (fresh) setGlobalSeedItems(fresh.items);
    setSeedLoading(false);
  }, [catalog]);

  const openPalette = useCallback((source: "slash" | "command_k" | "navigation") => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setIsClosing(false);
    setOpen(true);
    void warmSearchSeed();
    trackSearchEvent("open", { source });
  }, [warmSearchSeed]);

  const close = useCallback(() => {
    if (!open || isClosing) return;
    setIsClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      closeTimer.current = null;
    }, 160);
  }, [isClosing, open]);

  useEffect(() => setMounted(true), []);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        openPalette(event.key === "/" ? "slash" : "command_k");
      }
      if (event.key === "Escape") close();
    };
    const show = (event: Event) => {
      const query = (event as CustomEvent<{ query?: unknown }>).detail?.query;
      if (typeof query === "string" && query.trim()) setQ(query.trim().slice(0, 240));
      openPalette("navigation");
    };
    const warm = () => { void warmSearchSeed(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("core-watch-search", show);
    window.addEventListener("core-watch-search-warm", warm);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("core-watch-search", show);
      window.removeEventListener("core-watch-search-warm", warm);
    };
  }, [close, openPalette, warmSearchSeed]);

  useEffect(() => {
    if (catalog) return;
    const browserWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const requestIdle = browserWindow.requestIdleCallback;
    const cancelIdle = browserWindow.cancelIdleCallback;
    const handle = requestIdle
      ? requestIdle(() => { void warmSearchSeed(); }, { timeout: 1_200 })
      : window.setTimeout(() => { void warmSearchSeed(); }, 320);
    return () => {
      if (cancelIdle && requestIdle) cancelIdle(handle);
      else window.clearTimeout(handle);
    };
  }, [catalog, warmSearchSeed]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    const priorPaddingRight = document.body.style.paddingRight;
    const priorDocumentOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const computedPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    // Some browsers use the document element, rather than body, as the page
    // scroller. Lock both while the palette is open so wheel input stays with
    // the results list.
    document.documentElement.style.overflow = "hidden";

    // Lenis (and a few browser/trackpad combinations) can still receive a
    // wheel event from the document after a modal has opened. Capture that
    // input at the window, stop it before it reaches page scrolling, and send
    // it to the one scrollable surface inside Search instead.
    const routeWheelToResults = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      event.preventDefault();
      event.stopPropagation();
      const results = dialog.querySelector<HTMLElement>(".watch-search-results");
      if (!results) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? results.clientHeight
          : 1;
      results.scrollTop += event.deltaY * scale;
    };
    window.addEventListener("wheel", routeWheelToResults, { capture: true, passive: false });
    setActiveKey(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.removeEventListener("wheel", routeWheelToResults, true);
      document.body.style.overflow = priorOverflow;
      document.body.style.paddingRight = priorPaddingRight;
      document.documentElement.style.overflow = priorDocumentOverflow;
      previousFocus.current?.focus();
    };
  }, [open]);

  const recentStorageKey = `${RECENT_SEARCH_PREFIX}:${user?.id ?? "guest"}`;

  useEffect(() => {
    if (!mounted || authLoading) return;
    let cancelled = false;
    const readLocal = (key: string) => {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
        return Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, RECENT_SEARCH_LIMIT)
          : [];
      } catch {
        return [];
      }
    };
    // A signed-in account has its own namespace. Guest searches are never
    // promoted into an account merely because somebody signs in on the same
    // browser.
    const local = readLocal(recentStorageKey);
    const optimistic = local;
    setRecentSearches(optimistic);
    if (!user) return;

    const controller = new AbortController();
    void fetch("/api/account/workspaces?kind=search-recents", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`search_recents_${response.status}`);
      return response.json() as Promise<{ items?: Array<{ name?: string; payload?: { queries?: unknown } }> }>;
    }).then((data) => {
      if (cancelled) return;
      const remoteValue = data.items?.find((item) => item.name === "recent")?.payload?.queries;
      const remote = Array.isArray(remoteValue)
        ? remoteValue.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const merged = [...new Set([...optimistic, ...remote])].slice(0, RECENT_SEARCH_LIMIT);
      setRecentSearches(merged);
      window.localStorage.setItem(recentStorageKey, JSON.stringify(merged));
      if (JSON.stringify(merged) !== JSON.stringify(remote.slice(0, RECENT_SEARCH_LIMIT))) {
        void fetch("/api/account/workspaces", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "search-recents", name: "recent", payload: { version: 1, queries: merged } }),
        }).catch(() => undefined);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authLoading, mounted, recentStorageKey, user]);

  function persistRecentSearches(next: string[]) {
    const bounded = [...new Set(next.map((value) => value.trim()).filter(Boolean))].slice(0, RECENT_SEARCH_LIMIT);
    setRecentSearches(bounded);
    try {
      window.localStorage.setItem(recentStorageKey, JSON.stringify(bounded));
    } catch {}
    if (user) {
      void fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "search-recents", name: "recent", payload: { version: 1, queries: bounded } }),
      }).catch(() => undefined);
    }
  }

  function rememberQuery() {
    const value = q.trim();
    if (value.length >= 2) persistRecentSearches([value, ...recentSearches]);
  }

  function clearRecentSearches() {
    setRecentSearches([]);
    try {
      window.localStorage.removeItem(recentStorageKey);
    } catch {}
    if (user) {
      void fetch("/api/account/workspaces?kind=search-recents&name=recent", {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => undefined);
    }
  }

  const items = useMemo(() => {
    const all: WatchItem[] = catalog?.all ?? globalSeedItems;
    return dedupeItems(all);
  }, [catalog, globalSeedItems]);

  // The media index intentionally retains removed assets for recovery. Search
  // must still render only the current catalog so a growing Twitch archive
  // cannot reappear after it has been folded into its live session.
  const currentCatalogItems = useMemo(
    () => new Map(items.map((item) => [`${item.platform}:${item.id}`, item])),
    [items],
  );

  const filteredItems = useMemo(() => items.filter((item) => {
    if (!matchesFilter(item, filter)) return false;
    if (platformFilter !== "all" && item.platform !== platformFilter) return false;
    if (creatorFilter === "house" && item.memberSlug !== null) return false;
    if (creatorFilter !== "all" && creatorFilter !== "house" && item.memberSlug !== creatorFilter) return false;
    return true;
  }), [creatorFilter, filter, items, platformFilter]);
  const needle = q.trim();
  const deferredNeedle = useDeferredValue(needle);
  const canSemanticSearch = subscription.hasFeature("search.semantic");
  const canFuzzySearch = subscription.hasFeature("search.fuzzy_advanced");
  const canSearchMoments = subscription.hasFeature("search.moments");
  const searchKey = `${normalize(needle)}\u0000${filter}\u0000${platformFilter}\u0000${creatorFilter}\u0000${canSemanticSearch ? "enhanced" : "basic"}`;
  const indexedSearchKey = `${normalize(deferredNeedle)}\u0000${filter}\u0000${platformFilter}\u0000${creatorFilter}\u0000${canSemanticSearch ? "enhanced" : "basic"}\u0000${canSearchMoments ? "moments" : "no-moments"}`;

  const hasLocalSearchCriteria = needle.length > 0
    || filter !== "all"
    || platformFilter !== "all"
    || creatorFilter !== "all";
  const hasServerSearchCriteria = deferredNeedle.length > 0
    || filter !== "all"
    || platformFilter !== "all"
    || creatorFilter !== "all";

  useEffect(() => {
    if (!open || !hasServerSearchCriteria) {
      setIndexedSearch(null);
      return;
    }

    const controller = new AbortController();
    const requestKey = indexedSearchKey;
    const cached = readQueryCache(requestKey);
    const cacheIsFresh = cached ? isQueryCacheFresh(requestKey, cached) : false;
    if (cached) {
      setIndexedSearch({ ...cached.state, status: cacheIsFresh ? "ready" : "loading" });
      if (cacheIsFresh) return () => controller.abort();
    } else {
      setIndexedSearch((current) => ({
        key: requestKey,
        status: "loading",
        indexed: current?.key === requestKey ? current.indexed : 0,
        provider: current?.key === requestKey ? current.provider : "local",
        tookMs: current?.key === requestKey ? current.tookMs : 0,
        results: current?.key === requestKey ? current.results : [],
      }));
    }

    const timer = window.setTimeout(() => {
      const prefersLive = filter === "live" || /\b(?:live|streaming|on now)\b/i.test(deferredNeedle);
      const params = new URLSearchParams({ q: deferredNeedle, limit: "48", liveFirst: String(prefersLive) });
      params.set("mode", canSemanticSearch ? "enhanced" : "basic");
      const scope = scopeForFilter(filter);
      if (scope) params.set("scope", scope);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      if (creatorFilter !== "all") params.set("member", creatorFilter);

      void fetch(`/api/watch/search?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Search returned ${response.status}`);
        return response.json() as Promise<IndexedSearchResponse>;
      }).then((payload) => {
        if (controller.signal.aborted) return;
        const nextState: IndexedSearchState = {
          key: requestKey,
          status: "ready",
          indexed: payload.indexed,
          provider: payload.provider,
          tookMs: payload.tookMs,
          results: payload.results
             .flatMap((result) => {
                const item = currentCatalogItems.get(`${result.item.platform}:${result.item.id}`) ?? (!catalog ? result.item : null);
                if (!item) return [];
                const allowedWithoutCatalog = !catalog
                 && matchesFilter(item, filter)
                 && (platformFilter === "all" || item.platform === platformFilter)
                 && (creatorFilter === "all"
                   || creatorFilter === "house" && item.memberSlug === null
                   || creatorFilter !== "house" && item.memberSlug === creatorFilter);
               const allowed = allowedWithoutCatalog || filteredItems.some((candidate) => itemKey(candidate) === itemKey(item));
                return allowed ? [{ result, item }] : [];
            })
             .map(({ result, item }) => ({
              key: itemKey(item),
              item,
              score: result.score,
              evidence: (Array.isArray(result.evidence)
                ? result.evidence.filter(Boolean).join(" · ")
                : result.evidence)?.slice(0, 180),
              matchedTerms: result.matchedTerms,
              moment: canSearchMoments && result.moment
                ? { title: result.moment.label, seconds: result.moment.startSeconds }
                : undefined,
            })),
        };
        writeQueryCache(requestKey, nextState);
        setIndexedSearch(nextState);
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Local indexed search is unavailable; using catalog search.", error);
        setIndexedSearch({ key: requestKey, status: "fallback", indexed: 0, provider: "catalog", tookMs: 0, results: [] });
      });
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearchMoments, canSemanticSearch, catalog, creatorFilter, currentCatalogItems, deferredNeedle, filter, filteredItems, hasServerSearchCriteria, indexedSearchKey, open, platformFilter]);

  const hits = useMemo(() => {
    if (hasLocalSearchCriteria) {
      const local = needle
        ? canFuzzySearch
        ? paletteSearch(filteredItems, needle, 60)
        : basicPaletteSearch(filteredItems, needle, 60)
        : [...filteredItems]
          .sort((a, b) => {
            const live = Number(b.kind === "live" || b.format === "live") - Number(a.kind === "live" || a.format === "live");
            return live || Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0") || itemKey(a).localeCompare(itemKey(b));
          })
          .slice(0, 60)
          .map((item) => ({ key: itemKey(item), item, score: 0 }));
      const indexedMatchesVisibleQuery = deferredNeedle === needle && indexedSearch?.key === indexedSearchKey;
      if (!indexedMatchesVisibleQuery || indexedSearch.status === "fallback") return local;
      return mergeRankedResults(local, indexedSearch.results, needle, 60);
    }
    return [...filteredItems]
      .sort((a, b) => {
        const live = Number(b.kind === "live" || b.format === "live") - Number(a.kind === "live" || a.format === "live");
        return live || Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0");
      })
      .slice(0, 36)
      .map((item) => ({ key: itemKey(item), item, score: 0 }));
  }, [canFuzzySearch, deferredNeedle, filteredItems, hasLocalSearchCriteria, indexedSearch, indexedSearchKey, needle]);

  const platformFacets = useMemo(() => PLATFORM_FILTERS.map((option) => ({
    ...option,
    count: items.filter((item) => option.id === "all" || item.platform === option.id).length,
  })).filter((option) => option.id === "all" || option.count > 0), [items]);

  const creatorFacets = useMemo(() => {
    const countFor = (slug: string | null) => items.filter((item) => item.memberSlug === slug).length;
    return [
      { id: "all" as const, label: "All creators", count: items.length },
      { id: "house" as const, label: "CORE house", count: countFor(null) },
      ...MEMBERS.map((member) => ({ id: member.slug, label: member.stageName, count: countFor(member.slug) })),
    ].filter((option) => option.id === "all" || option.count > 0);
  }, [items]);

  const continueItems = useMemo(() => items
    .map((item) => ({ item, watched: progressFor(item, watchProgress) }))
    .filter(({ item, watched }) => Boolean(itemToPlayable(item)) && watched.progress > 0.02 && !watched.completed)
    .sort((a, b) => b.watched.progress - a.watched.progress)
    .slice(0, 3)
    .map(({ item }) => item), [items, watchProgress]);

  const liveItems = useMemo(() => items
    .filter((item) => matchesFilter(item, "live"))
    .sort((a, b) => Date.parse(b.live?.startedAt ?? b.publishedAt ?? "0") - Date.parse(a.live?.startedAt ?? a.publishedAt ?? "0"))
    .slice(0, 3), [items]);

  const trendingItems = useMemo(() => {
    const excluded = new Set([...liveItems, ...continueItems].map(itemKey));
    const source = catalog?.recent?.length ? catalog.recent : items;
    return source
      .filter((item) => !excluded.has(itemKey(item)))
      .sort((a, b) => {
        const aWatched = progressFor(a, watchProgress).completed ? 1 : 0;
        const bWatched = progressFor(b, watchProgress).completed ? 1 : 0;
        return aWatched - bWatched || Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0");
      })
      .slice(0, 6);
  }, [catalog?.recent, continueItems, items, liveItems, watchProgress]);

  const memberHits = useMemo(() => {
    if (!needle || filter !== "all" || creatorFilter !== "all") return [];
    const terms = canFuzzySearch
      ? rawQueryTerms(needle)
      : normalize(needle).split(/\s+/).filter(Boolean);
    return MEMBERS
      .map((member) => {
        const words = normalize(`${member.stageName} ${member.slug} ${member.comm.name} ${member.twitchLogin}`).split(" ");
        const matches = terms.map((term) => words.reduce((best, word) => Math.max(
          best,
          canFuzzySearch ? fuzzyTokenScore(term, word) : Number(word.includes(term)),
        ), 0));
        const score = matches.reduce((total, match) => total + match, 0);
        const coverage = matches.filter((match) => match >= 0.68).length / Math.max(1, terms.length);
        return { member, score, coverage };
      })
      .filter(({ score, coverage }) => score >= 0.68 && coverage >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ member }) => member);
  }, [canFuzzySearch, creatorFilter, filter, needle]);

  const showDiscovery = !needle && filter === "all" && platformFilter === "all" && creatorFilter === "all";
  const featuredItem = continueItems[0] ?? liveItems[0] ?? trendingItems[0] ?? null;
  const discoveryGroups = useMemo<DiscoveryGroup[]>(() => {
    const withoutFeatured = (source: WatchItem[]) => source.filter((item) => itemKey(item) !== (featuredItem ? itemKey(featuredItem) : ""));
    const remainingContinue = withoutFeatured(continueItems);
    const remainingLive = withoutFeatured(liveItems);
    const remainingTrending = withoutFeatured(trendingItems);
    const groups: DiscoveryGroup[] = [];

    if (continueItems.length) {
      if (remainingContinue.length) groups.push({ key: "continue", title: "Continue watching", items: remainingContinue });
      if (recentSearches.length) groups.push({ key: "recent", title: "Recent searches", queries: recentSearches });
      else if (remainingLive.length) groups.push({ key: "live", title: "Live now", items: remainingLive });
      else if (remainingTrending.length) groups.push({ key: "trending", title: "Trending", items: remainingTrending });
    } else if (liveItems.length) {
      if (remainingLive.length) groups.push({ key: "live", title: "Live now", items: remainingLive });
      if (remainingTrending.length) groups.push({ key: "trending", title: "Trending", items: remainingTrending });
      else if (recentSearches.length) groups.push({ key: "recent", title: "Recent searches", queries: recentSearches });
    } else {
      if (remainingTrending.length) groups.push({ key: "trending", title: "Trending", items: remainingTrending });
      if (recentSearches.length) groups.push({ key: "recent", title: "Recent searches", queries: recentSearches });
    }
    return groups.slice(0, 2);
  }, [continueItems, featuredItem, liveItems, recentSearches, trendingItems]);

  const discoveryRows = useMemo<PaletteRow[]>(() => {
    const seen = new Set<string>();
    const content = [
      ...(featuredItem ? [featuredItem] : []),
      ...discoveryGroups.flatMap((group) => group.key === "recent" ? [] : group.items),
    ]
      .filter((item) => {
        const key = itemKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({ key: rowKey(item), type: "item" as const, result: { key: itemKey(item), item, score: 0 } }));
    return content;
  }, [discoveryGroups, featuredItem]);
  const searchRows = useMemo<PaletteRow[]>(() => [
    ...memberHits.map((member) => ({ key: `member-${member.slug}`, type: "member" as const, member })),
    ...hits.slice(0, 24).map((result) => ({ key: rowKey(result.item), type: "item" as const, result })),
  ], [hits, memberHits]);
  const rows = showDiscovery ? discoveryRows : searchRows;
  const isRefining = needle.length >= 2
    && deferredNeedle === needle
    && indexedSearch?.key === indexedSearchKey
    && indexedSearch.status === "loading";
  const membershipPlanName = subscription.requiredPlanName("search.semantic");
  const showMembershipHint = !subscription.loading
    && !canSemanticSearch
    && needle.length >= 2
    && rows.length <= 2
    && membershipPlanName !== "Free";
  const showSeedSkeleton = showDiscovery && !items.length && seedLoading;

  useEffect(() => {
    queryStartedAt.current = performance.now();
    resultEventKey.current = null;
  }, [creatorFilter, filter, platformFilter, q]);

  useEffect(() => {
    if (!rows.length) {
      setActiveKey(null);
      return;
    }
    setActiveKey((current) => current && rows.some((row) => row.key === current) ? current : rows[0]?.key ?? null);
  }, [rows]);

  const activeRow = rows.find((row) => row.key === activeKey) ?? rows[0] ?? null;

  useEffect(() => {
    if (!open || !activeRow) return;
    document.getElementById(`watch-search-${activeRow.key}`)?.scrollIntoView({ block: "nearest" });
  }, [activeRow, open]);

  useEffect(() => {
    if (!open || needle.length < 2) return;
    const eventKey = `${searchKey}:${indexedSearch?.status ?? "local"}:${rows.length}`;
    const timer = window.setTimeout(() => {
      if (resultEventKey.current === eventKey) return;
      resultEventKey.current = eventKey;
      trackSearchEvent("results", {
        content_filter: filter,
        platform_filter: platformFilter,
        creator_filter: creatorFilter === "all" ? "all" : "selected",
        zero_result: rows.length === 0,
        result_count_bucket: resultCountBucket(rows.length),
        latency_bucket: latencyBucket(performance.now() - queryStartedAt.current),
      });
    }, indexedSearch?.status === "loading" ? 400 : 120);
    return () => window.clearTimeout(timer);
  }, [creatorFilter, filter, indexedSearch?.status, needle.length, open, platformFilter, rows.length, searchKey]);

  function chooseRow(row: PaletteRow) {
    rememberQuery();
    const position = Math.max(0, rows.findIndex((candidate) => candidate.key === row.key));
    if (row.type === "member") {
      trackSearchEvent("result_open", { result_kind: "creator", position, playback_handoff: false });
      router.push(`/channels/${row.member.slug}`);
      close();
      return;
    }
    const { item, moment } = row.result;
    const playable = itemToPlayable(item);
    const rankedQueue = needle
      ? hits.map((result) => result.item).filter((candidate) => Boolean(itemToPlayable(candidate)))
      : filteredItems.filter((candidate) => Boolean(itemToPlayable(candidate)));
    trackSearchEvent("result_open", {
      result_kind: formatLabel(item).toLowerCase().replace(/\s+/g, "_"),
      platform: item.platform,
      position,
      playback_handoff: Boolean(playable),
    });
    if (playable) {
      player.play(item, rankedQueue, moment ? { startAtSeconds: moment.seconds } : undefined);
      trackSearchEvent("playback_handoff", { platform: item.platform, result_kind: formatLabel(item).toLowerCase() });
    } else {
      const destination = item.sourceUrl || item.href;
      if (/^https?:\/\//i.test(destination)) window.open(destination, "_blank", "noopener,noreferrer");
      else router.push(destination as never);
    }
    close();
  }

  function beginHover(key: string) {
    setActiveKey(key);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      const current = Math.max(0, rows.findIndex((row) => row.key === activeRow?.key));
      const next = event.key === "ArrowDown" ? (current + 1) % rows.length : (current - 1 + rows.length) % rows.length;
      setActiveKey(rows[next]?.key ?? null);
      return;
    }
    if (event.key === "Enter" && document.activeElement === inputRef.current && activeRow) {
      event.preventDefault();
      chooseRow(activeRow);
      return;
    }
    if (event.key === "Tab" && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [href]"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  function renderRow(row: PaletteRow, featured = false) {
    const selected = activeRow?.key === row.key;
    if (row.type === "member") {
      return (
        <li key={row.key} id={`watch-search-${row.key}`} data-active={selected || undefined}>
          <button
            type="button"
            className="watch-search-member-row"
            aria-current={selected ? "true" : undefined}
            onMouseEnter={() => beginHover(row.key)}
            onFocus={() => setActiveKey(row.key)}
            onClick={() => chooseRow(row)}
          >
            <span className="watch-search-member-photo"><WatchThumb src={row.member.portrait} alt="" /></span>
            <span className="watch-search-result-copy">
              <small><Users aria-hidden /> Creator channel</small>
              <strong>{row.member.stageName}</strong>
              <span>{row.member.comm.name} · Everything from this creator</span>
            </span>
            <span className="watch-search-row-cta">View channel</span>
          </button>
        </li>
      );
    }

    const item = row.result.item;
    const shape = contentShape(item);
    const youtubeId = item.platform === "youtube" ? youtubeIdFromHref(item.href) : null;
    const isLive = item.kind === "live" || item.format === "live";
    const watched = progressFor(item, watchProgress);
    const detail = resultDetail(item);
    const action = resultAction(item, watched);
    return (
      <li
        key={row.key}
        id={`watch-search-${row.key}`}
        data-active={selected || undefined}
      >
        <button
          type="button"
          className={`watch-search-result-main${featured ? " is-featured watch-search-featured-card" : ""}`}
          aria-current={selected ? "true" : undefined}
          onMouseEnter={() => beginHover(row.key)}
          onFocus={() => setActiveKey(row.key)}
          onClick={() => chooseRow(row)}
        >
          <span className={`watch-search-result-thumb is-${shape}`}>
            <WatchThumb youtubeId={youtubeId} src={item.poster} alt="" focalPoint={item.focalPoint} />
            {item.format !== "photo" && item.kind !== "post" ? <Play aria-hidden fill="currentColor" /> : item.kind === "post" ? <MessageSquareText aria-hidden /> : <ImageIcon aria-hidden />}
            {isLive ? <em>Live</em> : null}
            {!isLive && item.duration ? <b>{item.duration}</b> : null}
            {watched.progress > 0.02 && !watched.completed ? <span className="watch-search-result-progress"><i style={{ width: `${Math.round(watched.progress * 100)}%` }} /></span> : null}
          </span>
          <span className="watch-search-result-copy">
            <small className="has-platform-icon"><PlatformMark platform={item.platform} /> {platformLabel(item.platform)} · {formatLabel(item)}</small>
            <strong>{item.title}</strong>
            <span>{watchAttributionLabel(item)}{detail ? ` · ${detail}` : ""}</span>
            {canSearchMoments && row.result.moment ? <mark>Matched scene · {row.result.moment.title}</mark> : null}
            {canSemanticSearch && !row.result.moment && row.result.evidence ? <mark>Smart match · {row.result.evidence}</mark> : null}
            {watched.completed ? <mark>Watched</mark> : null}
          </span>
          {!featured ? <span className="watch-search-row-cta">{action}</span> : null}
        </button>
      </li>
    );
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`watch-search-backdrop${isClosing ? " is-closing" : ""}`}
      data-closing={isClosing || undefined}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <div
        ref={dialogRef}
        className={`watch-search-dialog${isClosing ? " is-closing" : ""}`}
        data-closing={isClosing || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-search-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="watch-search-head">
          <div className="watch-search-title-row">
            <span className="watch-search-brand is-neutral" aria-hidden><Search /></span>
            <h1 id="watch-search-title">Search CORE</h1>
            <Tooltip title="Close search" description="Return to Watch without changing playback." placement="bottom">
              <button type="button" className="watch-search-close" onClick={close} aria-label="Close search"><X /></button>
            </Tooltip>
          </div>
          <div className="watch-search-field">
            <Search aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search titles, creators, platforms, and formats"
              aria-label="Search all CORE content"
              role="searchbox"
              aria-controls="watch-search-results"
              autoComplete="off"
              spellCheck="false"
            />
            {q ? (
              <Tooltip title="Clear search" description="Remove your query and show all available results." placement="bottom">
                <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X /></button>
              </Tooltip>
            ) : <kbd>/</kbd>}
          </div>
          <div className="watch-search-filterbar">
            <div className="watch-search-filters" aria-label="Filter search results">
              {[...PRIMARY_FILTERS].map((filterId) => {
                const option = FILTERS.find((entry) => entry.id === filterId)!;
                return (
                  <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => {
                    setFilter(option.id);
                    trackSearchEvent("filter", { filter_type: "content", filter_value: option.id });
                  }}>
                    {filterIcon(option.id)}
                    {option.label}
                    {option.id === "live" && items.some((item) => matchesFilter(item, "live")) ? <i aria-label="Live content available" /> : null}
                  </button>
                );
              })}
            </div>
            <details className="watch-search-more-filters">
              <summary>
                <SlidersHorizontal aria-hidden />
                Filters
                {!PRIMARY_FILTERS.has(filter) || platformFilter !== "all" || creatorFilter !== "all" ? <b>{Number(!PRIMARY_FILTERS.has(filter)) + Number(platformFilter !== "all") + Number(creatorFilter !== "all")}</b> : null}
                <ChevronDown aria-hidden />
              </summary>
              <div className="watch-search-filter-popover">
                <fieldset>
                  <legend>Content type</legend>
                  <div className="watch-search-content-options">
                    {HIDDEN_CONTENT_FILTERS.map((option) => (
                      <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => {
                        setFilter(option.id);
                        trackSearchEvent("filter", { filter_type: "content", filter_value: option.id });
                      }}>
                        {filterIcon(option.id)}
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Platform</legend>
                  <div className="watch-search-platform-options">
                    {platformFacets.map((option) => (
                      <button key={option.id} type="button" aria-pressed={platformFilter === option.id} onClick={() => {
                        setPlatformFilter(option.id);
                        trackSearchEvent("filter", { filter_type: "platform", filter_value: option.id });
                      }}>
                        {option.id !== "all" ? <PlatformMark platform={option.id} /> : <Search aria-hidden />}
                        <span>{option.label}</span><small>{option.count}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label>
                  <span>Creator</span>
                  <select value={creatorFilter} onChange={(event) => {
                    const value = event.target.value as SearchCreatorFilter;
                    setCreatorFilter(value);
                    trackSearchEvent("filter", { filter_type: "creator", filter_value: value === "all" ? "all" : "selected" });
                  }}>
                    {creatorFacets.map((option) => <option key={option.id} value={option.id}>{option.label} ({option.count})</option>)}
                  </select>
                </label>
                <button type="button" className="watch-search-reset-filters" onClick={() => {
                  setFilter("all");
                  setPlatformFilter("all");
                  setCreatorFilter("all");
                  trackSearchEvent("filter", { filter_type: "reset", filter_value: "all" });
                }}><RotateCcw aria-hidden /> Reset filters</button>
              </div>
            </details>
          </div>
        </header>

        <div className="watch-search-body">
          <section className="watch-search-results-shell" aria-label="Search results">
            <div className="watch-search-results-head">
              <div>
                <p aria-live="polite">{needle
                  ? `${hits.length + memberHits.length} result${hits.length + memberHits.length === 1 ? "" : "s"}${hits.length + memberHits.length > rows.length ? ` · top ${rows.length} shown` : ""}`
                  : showDiscovery ? "Browse" : FILTERS.find((entry) => entry.id === filter)?.label}</p>
                {isRefining ? <small className="watch-search-refining">Refining matches</small> : null}
              </div>
              <span><kbd>↑</kbd><kbd>↓</kbd> move <CornerDownLeft /> open</span>
            </div>
            {showSeedSkeleton ? (
              <ul id="watch-search-results" className="watch-search-results" aria-label="Loading recommendations">
                {Array.from({ length: 3 }, (_, index) => <li className="watch-search-skeleton" key={index} aria-hidden />)}
              </ul>
            ) : showDiscovery ? (
              <div id="watch-search-results" className="watch-search-results watch-search-discovery">
                {featuredItem ? (() => {
                  const row = discoveryRows.find((candidate) => candidate.type === "item" && itemKey(candidate.result.item) === itemKey(featuredItem));
                  return row ? <section className="watch-search-featured"><h2>For you</h2><ul>{renderRow(row, true)}</ul></section> : null;
                })() : null}
                {discoveryGroups.map((group) => group.key === "recent" ? (
                  <section className="watch-search-recent-section" key={group.key}>
                    <div className="watch-search-discovery-title"><h2><Clock3 aria-hidden /> {group.title}</h2><button type="button" onClick={clearRecentSearches}>Clear</button></div>
                    <div className="watch-search-recent-chips">{group.queries.map((query) => <button key={query} type="button" onClick={() => {
                      setQ(query);
                      trackSearchEvent("recent_open", { source: user ? "account" : "local" });
                      window.requestAnimationFrame(() => inputRef.current?.focus());
                    }}><Search aria-hidden />{query}</button>)}</div>
                  </section>
                ) : (
                  <section key={group.key}>
                    <h2>{group.key === "live" ? <Radio aria-hidden /> : group.key === "continue" ? <Clock3 aria-hidden /> : <TrendingUp aria-hidden />} {group.title}</h2>
                    <ul>{group.items.map((item) => {
                      const row = discoveryRows.find((candidate) => candidate.type === "item" && itemKey(candidate.result.item) === itemKey(item));
                      return row ? renderRow(row) : null;
                    })}</ul>
                  </section>
                ))}
                {!featuredItem && !discoveryGroups.length ? <div className="watch-search-no-results"><Search aria-hidden /><strong>Nothing to show yet</strong></div> : null}
              </div>
            ) : (
              <ul id="watch-search-results" className="watch-search-results">
                {rows.map((row) => renderRow(row))}
                {!rows.length ? (
                  <li className="watch-search-no-results">
                    <Search aria-hidden />
                    <strong>No exact match yet</strong>
                    <p>Try a creator, event, phrase, or content type.</p>
                    <button type="button" onClick={() => {
                      setQ(""); setFilter("all"); setPlatformFilter("all"); setCreatorFilter("all");
                    }}>Explore everything</button>
                  </li>
                ) : null}
                {showMembershipHint ? (
                  <li className="watch-search-membership-hint">
                    <Lock aria-hidden />
                    <span>Broader matches available with Membership</span>
                    <Link href={subscription.featureHref("search.semantic") as never} onClick={close}>Explore Membership</Link>
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
