import type { WatchItem, WatchPlatform } from "./types";

/**
 * Channel "Browse" view: one creator's catalog split by platform and format,
 * ordered by recency or by a real ranking signal. Pure and client-safe; the
 * server loads signals (lib/watch/channel-browse-signals.ts) and the client
 * only renders the ranked page it receives.
 */

export const BROWSE_PLATFORMS = ["all", "twitch", "youtube", "tiktok", "instagram", "x", "house"] as const;
export const BROWSE_FORMATS = ["all", "live", "broadcasts", "videos", "clips", "shorts", "reels", "photos", "posts"] as const;
export const BROWSE_SORTS = ["latest", "top", "watched"] as const;
export const BROWSE_WINDOWS = ["week", "month", "year", "all"] as const;

export type BrowsePlatform = (typeof BROWSE_PLATFORMS)[number];
export type BrowseFormat = (typeof BROWSE_FORMATS)[number];
export type BrowseSort = (typeof BROWSE_SORTS)[number];
export type BrowseWindow = (typeof BROWSE_WINDOWS)[number];

export type BrowseFilters = {
  platform: BrowsePlatform;
  format: BrowseFormat;
  sort: BrowseSort;
  window: BrowseWindow;
};

export const DEFAULT_BROWSE_FILTERS: BrowseFilters = { platform: "all", format: "all", sort: "latest", window: "all" };

/** URL keys are prefixed so they cannot collide with the route's `mode`. */
export const BROWSE_URL_KEYS = { platform: "platform", format: "format", sort: "sort", window: "window" } as const;

export const BROWSE_PAGE_SIZE = 24;

export const BROWSE_WINDOW_MS: Record<Exclude<BrowseWindow, "all">, number> = {
  week: 7 * 24 * 60 * 60 * 1_000,
  month: 30 * 24 * 60 * 60 * 1_000,
  year: 365 * 24 * 60 * 60 * 1_000,
};

export const BROWSE_PLATFORM_LABEL: Record<BrowsePlatform, string> = {
  all: "All platforms",
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  house: "CORE",
};

export const BROWSE_FORMAT_LABEL: Record<BrowseFormat, string> = {
  all: "Everything",
  live: "Live",
  broadcasts: "Broadcasts",
  videos: "Videos",
  clips: "Clips",
  shorts: "Shorts",
  reels: "Reels",
  photos: "Photos",
  posts: "Posts",
};

export const BROWSE_SORT_LABEL: Record<BrowseSort, string> = {
  latest: "Newest",
  top: "Top rated",
  watched: "Most watched on CORE",
};

export const BROWSE_WINDOW_LABEL: Record<BrowseWindow, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
};

function oneOf<T extends string>(values: readonly T[], value: string | null | undefined, fallback: T): T {
  return value && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function parseBrowseFilters(input: URLSearchParams | Record<string, string | null | undefined>): BrowseFilters {
  const read = (key: string) => input instanceof URLSearchParams ? input.get(key) : input[key];
  return {
    platform: oneOf(BROWSE_PLATFORMS, read(BROWSE_URL_KEYS.platform), DEFAULT_BROWSE_FILTERS.platform),
    format: oneOf(BROWSE_FORMATS, read(BROWSE_URL_KEYS.format), DEFAULT_BROWSE_FILTERS.format),
    sort: oneOf(BROWSE_SORTS, read(BROWSE_URL_KEYS.sort), DEFAULT_BROWSE_FILTERS.sort),
    window: oneOf(BROWSE_WINDOWS, read(BROWSE_URL_KEYS.window), DEFAULT_BROWSE_FILTERS.window),
  };
}

/** Only non-default values are written, so the plain channel URL stays canonical. */
export function browseSearchParams(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(BROWSE_URL_KEYS) as Array<keyof BrowseFilters>) {
    if (filters[key] !== DEFAULT_BROWSE_FILTERS[key]) params.set(BROWSE_URL_KEYS[key], filters[key]);
  }
  return params;
}

/** One format per item, matching the channel hub's non-overlapping shelves. */
export function browseFormatOf(item: WatchItem): Exclude<BrowseFormat, "all"> {
  if (item.kind === "live") return "live";
  if (item.kind === "vod") return "broadcasts";
  if (item.format === "photo") return "photos";
  // TikTok and Instagram posts are normalized with kind "clip"; they are
  // short-form posts, not stream clips.
  if (item.platform === "instagram") return "reels";
  if (item.platform === "tiktok") return "shorts";
  if (item.platform === "x") return "posts";
  if (item.kind === "clip") return "clips";
  if (item.format === "short") return "shorts";
  return "videos";
}

export function browseTimestamp(item: WatchItem): number {
  for (const value of [item.publishedAt, item.live?.startedAt]) {
    const parsed = Date.parse(value ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Real counts only. A missing field means the provider gives CORE no number. */
export type BrowseSignal = {
  /** Provider-reported lifetime views. */
  views?: number;
  /** Provider-reported likes. */
  likes?: number;
  /** CORE community upvotes (clips). */
  upvotes?: number;
  /** Measured seconds CORE fans watched on this site inside the window. */
  coreSeconds?: number;
  /** Distinct signed-in fans who watched on this site inside the window. */
  coreViewers?: number;
};

export type BrowseSignals = Record<string, BrowseSignal>;

/** Platforms whose provider API gives CORE a public view count. */
export const PLATFORMS_WITH_VIEW_COUNTS: ReadonlySet<WatchPlatform> = new Set(["twitch", "youtube"]);

export function browseItemKey(item: Pick<WatchItem, "platform" | "id">): string {
  return `${item.platform}:${item.id}`;
}

export type BrowseFacetCounts = {
  platforms: Partial<Record<BrowsePlatform, number>>;
  formats: Partial<Record<BrowseFormat, number>>;
};

/** Counts are computed for the other dimension's current selection. */
export function browseFacets(items: readonly WatchItem[], filters: Pick<BrowseFilters, "platform" | "format">): BrowseFacetCounts {
  const platforms: Partial<Record<BrowsePlatform, number>> = {};
  const formats: Partial<Record<BrowseFormat, number>> = {};
  for (const item of items) {
    const format = browseFormatOf(item);
    if (filters.format === "all" || filters.format === format) {
      platforms.all = (platforms.all ?? 0) + 1;
      platforms[item.platform] = (platforms[item.platform] ?? 0) + 1;
    }
    if (filters.platform === "all" || filters.platform === item.platform) {
      formats.all = (formats.all ?? 0) + 1;
      formats[format] = (formats[format] ?? 0) + 1;
    }
  }
  return { platforms, formats };
}

export function filterBrowseItems(items: readonly WatchItem[], filters: BrowseFilters, now: number): WatchItem[] {
  // "Most watched" windows apply to when fans watched, not when it was posted.
  const since = filters.window === "all" || filters.sort === "watched" ? null : now - BROWSE_WINDOW_MS[filters.window];
  return items.filter((item) => {
    if (filters.platform !== "all" && item.platform !== filters.platform) return false;
    if (filters.format !== "all" && browseFormatOf(item) !== filters.format) return false;
    if (since !== null) {
      // Live rooms are always current; everything else needs a real date.
      if (item.kind === "live") return true;
      const at = browseTimestamp(item);
      if (!at || at < since) return false;
    }
    return true;
  });
}

/** The single number an item is ranked by for a sort, or null when it has none. */
export function browseRankValue(signal: BrowseSignal | undefined, sort: BrowseSort): number | null {
  if (!signal) return null;
  if (sort === "top") {
    if (Number.isFinite(signal.views)) return signal.views!;
    // Community clips without a provider count are ranked by CORE upvotes.
    if (Number.isFinite(signal.upvotes) && signal.upvotes! > 0) return signal.upvotes!;
    return null;
  }
  if (sort === "watched") return signal.coreSeconds && signal.coreSeconds > 0 ? signal.coreSeconds : null;
  return null;
}

export type RankedBrowseItem = { item: WatchItem; rank: number | null; value: number | null };

/**
 * Items with a real signal come first, highest first. Items without one keep
 * their newest-first order after them: no number is ever estimated.
 */
export function rankBrowseItems(items: readonly WatchItem[], signals: BrowseSignals, sort: BrowseSort): RankedBrowseItem[] {
  const newestFirst = [...items].sort((a, b) => browseTimestamp(b) - browseTimestamp(a) || a.id.localeCompare(b.id));
  if (sort === "latest") {
    // Live rooms lead the newest view: they are happening now.
    const live = newestFirst.filter((item) => item.kind === "live");
    const rest = newestFirst.filter((item) => item.kind !== "live");
    return [...live, ...rest].map((item) => ({ item, rank: null, value: null }));
  }
  const ranked: Array<{ item: WatchItem; value: number }> = [];
  const unranked: WatchItem[] = [];
  for (const item of newestFirst) {
    const value = browseRankValue(signals[browseItemKey(item)], sort);
    if (value === null) unranked.push(item);
    else ranked.push({ item, value });
  }
  ranked.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    const left = signals[browseItemKey(a.item)];
    const right = signals[browseItemKey(b.item)];
    return (right?.likes ?? 0) - (left?.likes ?? 0)
      || (right?.upvotes ?? 0) - (left?.upvotes ?? 0)
      || browseTimestamp(b.item) - browseTimestamp(a.item);
  });
  return [
    ...ranked.map(({ item, value }, index) => ({ item, rank: index + 1, value })),
    ...unranked.map((item) => ({ item, rank: null, value: null })),
  ];
}

export type BrowseCoverage = {
  /** Items in the filtered set that have the active ranking signal. */
  ranked: number;
  total: number;
  /** Platforms in the filtered set where no item has the active signal. */
  platformsWithoutSignal: WatchPlatform[];
};

export function browseCoverage(items: readonly WatchItem[], signals: BrowseSignals, sort: BrowseSort): BrowseCoverage {
  if (sort === "latest") return { ranked: items.length, total: items.length, platformsWithoutSignal: [] };
  const withSignal = new Set<WatchPlatform>();
  const present = new Set<WatchPlatform>();
  let ranked = 0;
  for (const item of items) {
    if (item.kind === "live") continue;
    present.add(item.platform);
    if (browseRankValue(signals[browseItemKey(item)], sort) !== null) {
      ranked += 1;
      withSignal.add(item.platform);
    }
  }
  return {
    ranked,
    total: items.length,
    platformsWithoutSignal: [...present].filter((platform) => !withSignal.has(platform)).sort(),
  };
}

/** Human explanation shown above a ranked list; never claims data CORE lacks. */
function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function browseSignalNote(filters: BrowseFilters, coverage: BrowseCoverage): string | null {
  if (filters.sort === "latest") return null;
  if (filters.sort === "top") {
    // Platforms with no public count vs. platforms whose count CORE could not load.
    const silent = coverage.platformsWithoutSignal.filter((platform) => !PLATFORMS_WITH_VIEW_COUNTS.has(platform)).map((platform) => BROWSE_PLATFORM_LABEL[platform]);
    const missing = coverage.platformsWithoutSignal.filter((platform) => PLATFORMS_WITH_VIEW_COUNTS.has(platform)).map((platform) => BROWSE_PLATFORM_LABEL[platform]);
    const reasons = [
      silent.length ? `${joinNames(silent)} ${silent.length === 1 ? "doesn't" : "don't"} share view counts with CORE` : null,
      missing.length ? `${joinNames(missing)} view counts aren't available right now` : null,
    ].filter(Boolean).join("; ");
    if (!coverage.ranked) {
      return reasons ? `${reasons}, so this list is newest first.` : "No view counts are available for this selection yet, so it is newest first.";
    }
    const base = "Ranked by views reported by Twitch and YouTube, and CORE upvotes on clips.";
    return reasons ? `${base} ${reasons}, so those follow, newest first.` : base;
  }
  const period = filters.window === "all" ? "" : ` ${BROWSE_WINDOW_LABEL[filters.window].toLowerCase()}`;
  if (!coverage.ranked) return `Nothing here has been watched on CORE${period} yet, so this list is newest first.`;
  return `Ranked by time signed-in fans spent watching on CORE${period}. Everything else follows, newest first.`;
}

export function compactCount(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: value < 10_000 ? 1 : 0 }).format(value);
}

/** Short badge for a card, using only the numbers that exist. */
export function browseSignalLabel(signal: BrowseSignal | undefined, sort: BrowseSort): string | null {
  if (!signal) return null;
  if (sort === "watched" && signal.coreSeconds) {
    const hours = signal.coreSeconds / 3_600;
    const time = hours >= 1 ? `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h` : `${Math.max(1, Math.round(signal.coreSeconds / 60))}m`;
    return signal.coreViewers ? `${time} watched · ${signal.coreViewers} ${signal.coreViewers === 1 ? "fan" : "fans"}` : `${time} watched`;
  }
  const parts: string[] = [];
  if (Number.isFinite(signal.views)) parts.push(`${compactCount(signal.views!)} views`);
  if (signal.upvotes) parts.push(`${compactCount(signal.upvotes)} upvotes`);
  else if (Number.isFinite(signal.likes) && !parts.length) parts.push(`${compactCount(signal.likes!)} likes`);
  return parts.length ? parts.join(" · ") : null;
}
