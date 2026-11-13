"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import useSWRInfinite from "swr/infinite";
import { ArrowUpDown, ArrowUpRight, Layers, LayoutGrid, Play, Tv, X } from "lucide-react";
import { useBrowseFilters } from "@/hooks/useBrowseFilters";
import { youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { SocialIcon } from "@/components/ui/SocialIcon";
import {
  BROWSE_FORMAT_LABEL,
  BROWSE_FORMATS,
  BROWSE_PLATFORM_LABEL,
  BROWSE_PLATFORMS,
  BROWSE_WINDOW_LABEL,
  DEFAULT_BROWSE_FILTERS,
  browseFormatOf,
  browseSearchParams,
  browseSignalLabel,
  parseBrowseFilters,
  type BrowseFacetCounts,
  type BrowseFilters,
  type BrowseSignal,
} from "@/lib/watch/channel-browse";
import { mediaTypeLabel } from "@/lib/watch/channels";
import { cardThumbSource } from "@/lib/watch/thumbs";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import { itemToPlayable } from "@/lib/watch/playable";
import type { WatchItem } from "@/lib/watch/types";
import { WatchThumb } from "./WatchThumb";
import styles from "./ChannelBrowser.module.css";

type BrowsePage = {
  filters: BrowseFilters;
  facets: BrowseFacetCounts;
  total: number;
  nextOffset: number | null;
  note: string | null;
  items: Array<{ item: WatchItem; rank: number | null; signal: BrowseSignal | null }>;
};

const URL_DEFAULTS: Record<keyof BrowseFilters, string> = { ...DEFAULT_BROWSE_FILTERS };

/** Order and time range share one menu: "Top this week" reads as one choice. */
const SORT_OPTIONS: ReadonlyArray<{ sort: BrowseFilters["sort"]; window: BrowseFilters["window"]; label: string }> = [
  { sort: "latest", window: "all", label: "Newest" },
  { sort: "top", window: "week", label: "Top this week" },
  { sort: "top", window: "month", label: "Top this month" },
  { sort: "top", window: "year", label: "Top this year" },
  { sort: "top", window: "all", label: "Top of all time" },
  { sort: "watched", window: "week", label: "Most watched this week" },
  { sort: "watched", window: "month", label: "Most watched this month" },
  { sort: "watched", window: "all", label: "Most watched ever" },
];

function sortLabel(filters: Pick<BrowseFilters, "sort" | "window">): string {
  const preset = SORT_OPTIONS.find((option) => option.sort === filters.sort && option.window === filters.window);
  if (preset) return preset.label;
  const base = filters.sort === "latest" ? "Newest" : filters.sort === "top" ? "Top" : "Most watched";
  return `${base} · ${BROWSE_WINDOW_LABEL[filters.window].toLowerCase()}`;
}

async function fetchPage(url: string): Promise<BrowsePage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Library unavailable");
  return response.json();
}

function relativeDate(item: WatchItem, now: number): string | null {
  if (item.kind === "live") return "Live now";
  const at = Date.parse(item.publishedAt ?? item.live?.startedAt ?? "");
  if (!Number.isFinite(at)) return null;
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: days > 300 ? "numeric" : undefined }).format(at);
}

function PlatformGlyph({ platform }: { platform: WatchItem["platform"] | "all" }) {
  if (platform === "all") return <LayoutGrid size={14} aria-hidden />;
  if (platform === "house") return <Tv size={14} aria-hidden />;
  return <SocialIcon platform={platform} size={13} />;
}

function BrowseCard({ item, rank, signal, sort, now, onOpen }: {
  item: WatchItem;
  rank: number | null;
  signal: BrowseSignal | null;
  sort: BrowseFilters["sort"];
  now: number;
  onOpen: (item: WatchItem) => void;
}) {
  const playable = itemToPlayable(item);
  const youtubeId = item.platform === "youtube" ? playable?.youtubeId ?? youtubeIdFromHref(item.href) : null;
  const metric = browseSignalLabel(signal ?? undefined, sort);
  const date = relativeDate(item, now);
  const external = !playable ? item.sourceUrl ?? item.href : null;
  const content = (
    <>
      <span className={styles.thumb}>
        <WatchThumb
          {...cardThumbSource(item, item.memberSlug ? MEMBERS_BY_SLUG[item.memberSlug]?.portrait : undefined, youtubeId)}
          focalPoint={item.focalPoint}
          sizes="(max-width: 640px) 50vw, 20rem"
        />
        {rank ? <span className={styles.rank} aria-label={`Rank ${rank}`}>{rank}</span> : null}
        {item.kind === "live" ? <span className={styles.liveBadge}>Live</span> : item.duration ? <span className={styles.duration}>{item.duration}</span> : null}
        <span className={styles.playHint} aria-hidden>{playable ? <Play size={16} fill="currentColor" /> : <ArrowUpRight size={16} />}</span>
      </span>
      <span className={styles.copy}>
        <strong className={styles.title}>{item.title}</strong>
        <span className={styles.meta}>
          <PlatformGlyph platform={item.platform} />
          <span>{mediaTypeLabel(item)}</span>
          {date ? <span aria-hidden>·</span> : null}
          {date ? <span>{date}</span> : null}
        </span>
        {metric ? <span className={styles.metric}>{metric}</span> : null}
      </span>
    </>
  );
  if (external) {
    return <a className={styles.card} href={external} target={/^https?:/i.test(external) ? "_blank" : undefined} rel="noreferrer">{content}</a>;
  }
  return <button type="button" className={styles.card} onClick={() => onOpen(item)}>{content}</button>;
}

/**
 * Channel library filters. With no filter set, the curated per-source rails
 * (`children`) stay the default view; any filter switches to one ranked grid.
 * Filter state lives in the URL (`?platform=&format=&sort=&window=`) so a
 * view is shareable and survives back navigation from the player.
 */
export function ChannelBrowser({ channelSlug, channelName, onPlay, children }: {
  channelSlug: string;
  channelName: string;
  onPlay: (item: WatchItem, queue: readonly WatchItem[]) => void;
  children: ReactNode;
}) {
  const { filters: raw, update, ready } = useBrowseFilters(URL_DEFAULTS);
  const filters = useMemo(() => parseBrowseFilters(raw), [raw]);
  const query = browseSearchParams(filters).toString();
  const isDefault = query === "";
  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<BrowsePage>(
    (index, previous: BrowsePage | null) => {
      if (!ready) return null;
      if (previous && previous.nextOffset === null) return null;
      const params = new URLSearchParams(query);
      if (index > 0 && previous?.nextOffset) params.set("offset", String(previous.nextOffset));
      const suffix = params.toString();
      return `/api/watch/channels/${channelSlug}/browse${suffix ? `?${suffix}` : ""}`;
    },
    fetchPage,
    { revalidateFirstPage: false, revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 60_000 },
  );
  const platformsRef = useRef<HTMLDivElement>(null);
  // Keep the selected platform visible in the horizontally scrolling phone strip.
  useEffect(() => {
    const row = platformsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (row && chip && (chip.offsetLeft < row.scrollLeft || chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth)) {
      row.scrollLeft = Math.max(0, chip.offsetLeft - 16);
    }
  }, [filters.platform, data]);
  const first = data?.[0];
  const facets = first?.facets;
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return (data ?? []).flatMap((page) => page.items).filter(({ item }) => {
      const key = `${item.platform}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data]);
  const queue = useMemo(() => entries.map(({ item }) => item).filter((item) => itemToPlayable(item)), [entries]);
  const open = useCallback((item: WatchItem) => onPlay(item, queue), [onPlay, queue]);
  const set = (patch: Partial<BrowseFilters>) => update(patch);
  const portraitGrid = filters.format === "shorts" || filters.format === "reels"
    || (entries.length > 0 && entries.every(({ item }) => ["shorts", "reels"].includes(browseFormatOf(item))));
  const now = Date.now();
  const loadingMore = size > 0 && data !== undefined && data.length < size;
  const hasMore = Boolean(data?.at(-1)?.nextOffset);
  const visiblePlatforms = BROWSE_PLATFORMS.filter((platform) =>
    platform === "all" || platform === filters.platform || (facets?.platforms[platform] ?? 0) > 0);
  const visibleFormats = BROWSE_FORMATS.filter((format) =>
    format === "all" || format === filters.format || (facets?.formats[format] ?? 0) > 0);
  const currentSort = `${filters.sort}:${filters.window}`;
  const sortOptions = SORT_OPTIONS.some((option) => `${option.sort}:${option.window}` === currentSort)
    ? SORT_OPTIONS
    : [...SORT_OPTIONS, { sort: filters.sort, window: filters.window, label: sortLabel(filters) }];
  const summary = [
    filters.platform === "all" ? null : BROWSE_PLATFORM_LABEL[filters.platform],
    filters.format === "all" ? null : BROWSE_FORMAT_LABEL[filters.format],
    sortLabel(filters),
  ].filter(Boolean).join(" · ");

  return (
    <div className={styles.browser}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Library</span>
          <h2 id={`${channelSlug}-library-heading`}>From {channelName}</h2>
        </div>
        <div className={styles.toolbar} role="group" aria-labelledby={`${channelSlug}-library-heading`}>
          <div ref={platformsRef} className={styles.platforms} role="radiogroup" aria-label="Platform">
            {visiblePlatforms.map((platform) => (
              <button key={platform} type="button" role="radio" aria-checked={filters.platform === platform}
                title={`${platform === "all" ? "All platforms" : BROWSE_PLATFORM_LABEL[platform]}${facets?.platforms[platform] !== undefined ? ` · ${facets.platforms[platform]!.toLocaleString("en-US")} items` : ""}`}
                onClick={() => set({ platform })}>
                <PlatformGlyph platform={platform} />
                <span>{platform === "all" ? "All" : BROWSE_PLATFORM_LABEL[platform]}</span>
              </button>
            ))}
          </div>
          <div className={styles.menus}>
            <label className={styles.menu} data-active={filters.format !== "all" || undefined}>
              <Layers size={15} aria-hidden />
              <span className="sr-only">Format</span>
              <select value={filters.format} onChange={(event) => set({ format: event.target.value as BrowseFilters["format"] })}>
                {visibleFormats.map((format) => (
                  <option key={format} value={format}>{format === "all" ? "All formats" : BROWSE_FORMAT_LABEL[format]}</option>
                ))}
              </select>
            </label>
            <label className={styles.menu} data-active={filters.sort !== "latest" || undefined}>
              <ArrowUpDown size={15} aria-hidden />
              <span className="sr-only">Sort</span>
              <select value={currentSort} onChange={(event) => {
                const [sort, window] = event.target.value.split(":") as [BrowseFilters["sort"], BrowseFilters["window"]];
                set({ sort, window });
              }}>
                {sortOptions.map((option) => (
                  <option key={`${option.sort}:${option.window}`} value={`${option.sort}:${option.window}`}>{option.label}</option>
                ))}
              </select>
            </label>
            {!isDefault ? (
              <button type="button" className={styles.clear} onClick={() => set({ ...DEFAULT_BROWSE_FILTERS })} aria-label="Clear filters" title="Clear filters">
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {isDefault ? children : (
        <section className={styles.results} aria-live="polite" aria-busy={isLoading || loadingMore}>
          <p className={styles.resultsHeader}>
            <strong>{summary}</strong>
            {first ? <span>{first.total.toLocaleString("en-US")} {first.total === 1 ? "item" : "items"}</span> : null}
          </p>
          {first?.note ? <p className={styles.note}>{first.note}</p> : null}
          {error && !entries.length ? (
            <p className={styles.empty} role="status">
              The library could not be loaded. <button type="button" onClick={() => void mutate()}>Try again</button>
            </p>
          ) : !entries.length && (isLoading || !ready) ? (
            <div className={`${styles.grid} ${portraitGrid ? styles.portrait : ""}`} aria-hidden>
              {Array.from({ length: 8 }, (_, index) => <span key={index} className={styles.skeleton} />)}
            </div>
          ) : !entries.length ? (
            <p className={styles.empty} role="status">
              Nothing matches these filters{filters.window !== "all" ? ` ${BROWSE_WINDOW_LABEL[filters.window].toLowerCase()}` : ""}.{" "}
              {filters.window !== "all" ? <button type="button" onClick={() => set({ window: "all" })}>Show all time</button> : null}
            </p>
          ) : (
            <ol className={`${styles.grid} ${portraitGrid ? styles.portrait : ""}`}>
              {entries.map(({ item, rank, signal }) => (
                <li key={`${item.platform}:${item.id}`}>
                  <BrowseCard item={item} rank={rank} signal={signal} sort={filters.sort} now={now} onOpen={open} />
                </li>
              ))}
            </ol>
          )}
          {hasMore ? (
            <div className={styles.more}>
              <button type="button" disabled={loadingMore} onClick={() => void setSize(size + 1)}>
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
