"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import useSWRInfinite from "swr/infinite";
import { ArrowUpRight, Flame, LayoutGrid, Play, Sparkles, Trophy, Tv } from "lucide-react";
import { useBrowseFilters } from "@/hooks/useBrowseFilters";
import { youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { SocialIcon } from "@/components/ui/SocialIcon";
import {
  BROWSE_FORMAT_LABEL,
  BROWSE_FORMATS,
  BROWSE_PLATFORM_LABEL,
  BROWSE_PLATFORMS,
  BROWSE_SORT_LABEL,
  BROWSE_SORTS,
  BROWSE_WINDOW_LABEL,
  BROWSE_WINDOWS,
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

const SORT_ICON = { latest: Sparkles, top: Trophy, watched: Flame } as const;

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
  const controlsRef = useRef<HTMLDivElement>(null);
  // Keep the active chip visible in its horizontally scrolling row on phones.
  useEffect(() => {
    for (const row of controlsRef.current?.querySelectorAll<HTMLElement>("[data-chip-row]") ?? []) {
      const chip = row.querySelector<HTMLElement>('[aria-checked="true"]');
      if (chip && (chip.offsetLeft < row.scrollLeft || chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth)) {
        row.scrollLeft = Math.max(0, chip.offsetLeft - 24);
      }
    }
  }, [filters.platform, filters.format, data]);
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
  const headline = isDefault ? null
    : `${filters.sort === "latest" ? "Newest" : BROWSE_SORT_LABEL[filters.sort]}${filters.window === "all" ? (filters.sort === "latest" ? "" : " · all time") : ` · ${BROWSE_WINDOW_LABEL[filters.window].toLowerCase()}`}`;

  return (
    <div className={styles.browser}>
      <div ref={controlsRef} className={styles.controls} role="group" aria-label={`Browse ${channelName}'s library`}>
        <div className={styles.sortRow}>
          <div className={styles.segmented} role="radiogroup" aria-label="Order">
            {BROWSE_SORTS.map((sort) => {
              const Icon = SORT_ICON[sort];
              return (
                <button key={sort} type="button" role="radio" aria-checked={filters.sort === sort}
                  onClick={() => set({ sort })}>
                  <Icon size={14} aria-hidden />
                  <span>{sort === "watched" ? "Most watched" : BROWSE_SORT_LABEL[sort]}</span>
                </button>
              );
            })}
          </div>
          <label className={styles.windowSelect}>
            <span className="sr-only">Time range</span>
            <select value={filters.window} onChange={(event) => set({ window: event.target.value as BrowseFilters["window"] })}>
              {BROWSE_WINDOWS.map((window) => <option key={window} value={window}>{BROWSE_WINDOW_LABEL[window]}</option>)}
            </select>
          </label>
          {!isDefault ? (
            <button type="button" className={styles.reset} onClick={() => set({ ...DEFAULT_BROWSE_FILTERS })}>Reset</button>
          ) : null}
        </div>
        <div className={styles.chipRow} data-chip-row role="radiogroup" aria-label="Platform">
          {visiblePlatforms.map((platform) => (
            <button key={platform} type="button" role="radio" aria-checked={filters.platform === platform}
              className={styles.chip} onClick={() => set({ platform })}>
              <PlatformGlyph platform={platform} />
              <span>{platform === "all" ? "All" : BROWSE_PLATFORM_LABEL[platform]}</span>
              {facets?.platforms[platform] !== undefined ? <small>{facets.platforms[platform]}</small> : null}
            </button>
          ))}
        </div>
        <div className={styles.chipRow} data-chip-row role="radiogroup" aria-label="Format">
          {visibleFormats.map((format) => (
            <button key={format} type="button" role="radio" aria-checked={filters.format === format}
              className={`${styles.chip} ${styles.formatChip}`} onClick={() => set({ format })}>
              <span>{BROWSE_FORMAT_LABEL[format]}</span>
              {facets?.formats[format] !== undefined ? <small>{facets.formats[format]}</small> : null}
            </button>
          ))}
        </div>
      </div>

      {isDefault ? children : (
        <section className={styles.results} aria-live="polite" aria-busy={isLoading || loadingMore}>
          <header className={styles.resultsHeader}>
            <h2>{headline}</h2>
            {first ? <span>{first.total} {first.total === 1 ? "item" : "items"}</span> : null}
          </header>
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
