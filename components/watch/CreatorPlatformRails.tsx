"use client";

import { ArrowUpRight } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildCuratedChannelRails,
  type CuratedChannelPlatform,
  type CuratedChannelRail,
  type CuratedChannelSourceDescriptor,
} from "@/lib/watch/creator-platform-rails";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import type { WatchItem } from "@/lib/watch/types";
import { useWatchDiscovery, type WatchDiscoveryState, type WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { selectWatchHomeXPosts, type WatchHomeXPost } from "@/lib/watch/x-posts";
import { DragScrollRail } from "./DragScrollRail";
import {
  OfficialSocialEmbedFallback,
  TikTokEmbedScriptLoader,
} from "./OfficialSocialEmbedFallback";
import { PosterCard } from "./PosterCard";
import { XTweetsRail } from "./XTweetsRail";
import styles from "./CreatorPlatformRails.module.css";

export type CreatorPlatformSourceLink = {
  sourceKey: string;
  href: string;
  label?: string;
};

export type CreatorPlatformRailsProps = {
  channelName: string;
  channelSlug?: string;
  items: readonly WatchItem[];
  onPlay: (item: WatchItem, sourceQueue: readonly WatchItem[]) => void;
  maxItemsPerSource?: number;
  initialItemsPerSource?: number;
  sources?: readonly CuratedChannelSourceDescriptor[];
  sourceLinks?: readonly CreatorPlatformSourceLink[];
  className?: string;
  archiveEndpoint?: string;
  railTotals?: Readonly<Record<string, number>>;
};

const PLATFORM_LABEL: Record<CuratedChannelPlatform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

const RAIL_KIND_LABEL: Record<CuratedChannelRail["kind"], string> = {
  live: "Live",
  broadcasts: "Past broadcasts",
  videos: "Videos",
  shorts: "Shorts",
  posts: "Posts",
};

const INITIAL_MEDIA_ITEMS = 24;
const MEDIA_ITEMS_STEP = 24;

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function statusIdOf(item: WatchItem): string | null {
  if (item.x?.statusId) return item.x.statusId;
  const match = /\/(?:status|statuses)\/(\d+)/i.exec(item.sourceUrl ?? item.href);
  return match?.[1] ?? null;
}

function emptySourceMessage(rail: CuratedChannelRail): string {
  return `Recent ${PLATFORM_LABEL[rail.platform]} posts are not available here right now. You can visit the creator’s profile for their latest updates.`;
}

function emptySourceStatus(_rail: CuratedChannelRail): string {
  return "View creator profile";
}

function shouldRenderRail(rail: CuratedChannelRail): boolean {
  if (rail.items.length) return true;
  if (rail.platform !== "instagram" && rail.platform !== "tiktok") return false;
  return Boolean(rail.sourceHref || rail.handle || rail.ingestState);
}

function shouldUseOfficialEmbedFallback(rail: CuratedChannelRail): boolean {
  if (rail.platform !== "instagram" && rail.platform !== "tiktok") return false;
  return rail.items.length === 0;
}

function XSourceRail({ rail, posts }: { rail: CuratedChannelRail; posts: readonly WatchHomeXPost[] }) {
  const ids = new Set(rail.items.map(statusIdOf).filter((value): value is string => Boolean(value)));
  const visible = posts.filter((post) => ids.has(post.statusId));
  if (!visible.length) {
    return <div className={styles.empty}>{emptySourceMessage(rail)}</div>;
  }
  return <XTweetsRail items={visible} title={`${rail.sourceLabel} latest posts`} maxItems={visible.length} showHeading={false} />;
}

function MediaSourceRail({
  rail,
  onPlay,
  initialCount,
  archiveEndpoint,
  total,
  feedback,
  onFeedback,
  channelSlug,
}: {
  rail: CuratedChannelRail;
  onPlay: (item: WatchItem, sourceQueue: readonly WatchItem[]) => void;
  initialCount: number;
  archiveEndpoint?: string;
  total?: number;
  feedback: WatchDiscoveryState["feedback"];
  onFeedback: (item: WatchItem, value: WatchFeedbackValue | null) => void;
  channelSlug?: string;
}) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const [loadedItems, setLoadedItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadedTotal, setLoadedTotal] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [paginationCursor, setPaginationCursor] = useState<string | undefined>(undefined);
  const availableItems = useMemo(() => {
    const seen = new Set<string>();
    return [...rail.items, ...loadedItems].filter((item) => {
      const key = `${item.platform}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rail.items, loadedItems]);
  const visibleItems = availableItems.slice(0, visibleCount);
  const shortFormRail = rail.kind === "shorts" || (rail.kind === "videos" && rail.items.length > 0 && rail.items.every((item) => item.format === "short" || item.orientation === "portrait"));
  const openItem = useCallback((item: WatchItem, sourceQueue: readonly WatchItem[]) => {
    if (!shortFormRail || !channelSlug) { onPlay(item, sourceQueue); return; }
    const selected = `${item.platform}:${item.id}`;
    const index = Math.max(0, sourceQueue.findIndex((entry) => entry.platform === item.platform && entry.id === item.id));
    const items = sourceQueue.slice(Math.max(0, index - 6), index + 18);
    try { sessionStorage.setItem("core:scoped-shorts-seed", JSON.stringify({ channel: channelSlug, rail: rail.id, selected, items })); } catch { /* The archive endpoint also supports direct links. */ }
    const params = new URLSearchParams({ channel: channelSlug, rail: rail.id, item: selected });
    router.push(`/shorts?${params}` as never);
  }, [channelSlug, onPlay, rail.id, router, shortFormRail]);
  const availableTotal = loadedTotal ?? total ?? rail.items.length;
  const remaining = exhausted ? Math.max(0, availableItems.length - visibleItems.length) : Math.max(0, availableTotal - visibleItems.length);
  const revealCount = Math.min(MEDIA_ITEMS_STEP, remaining);
  const showMore = async () => {
    if (loading) return;
    if (!archiveEndpoint || availableItems.length > visibleCount) {
      setVisibleCount((count) => count + MEDIA_ITEMS_STEP);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const last = availableItems.at(-1);
      const params = new URLSearchParams({ rail: rail.id });
      if (paginationCursor !== undefined) params.set("after", paginationCursor);
      else if (last) params.set("after", `${last.platform}:${last.id}`);
      const response = await fetch(`${archiveEndpoint}?${params}`);
      if (!response.ok) throw new Error("Archive unavailable");
      const page = await response.json() as { items: WatchItem[]; total: number; nextCursor: string | null };
      setLoadedItems((items) => [...items, ...page.items]);
      setLoadedTotal(page.total);
      setExhausted(page.nextCursor === null);
      if (page.nextCursor !== null) setPaginationCursor(page.nextCursor);
      setVisibleCount((count) => count + MEDIA_ITEMS_STEP);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  return (
    <>
      <DragScrollRail
        className={`watch-shelf ${styles.homeMediaRail}`}
        role="region"
        tabIndex={0}
        aria-label={`${rail.sourceLabel} content archive`}
      >
        {visibleItems.map((item) => (
          <PosterCard
            key={`${item.platform}:${item.id}`}
            item={item}
            context={availableItems}
            onPlay={openItem}
            previewUsesOnPlay={shortFormRail && Boolean(channelSlug)}
            feedback={feedback[item.id]?.value ?? null}
            onFeedback={onFeedback}
            hoverAutoplay
          />
        ))}
      </DragScrollRail>
      {remaining > 0 ? (
        <div className={styles.archiveControls}>
          <span role={loadError ? "status" : undefined}>{loadError ? "Couldn’t load more. Please try again." : `${visibleItems.length.toLocaleString()} of ${availableTotal.toLocaleString()} available`}</span>
          <button type="button" disabled={loading} onClick={() => void showMore()}>
            {loading ? "Loading…" : loadError ? "Try again" : `Show ${revealCount.toLocaleString()} more`}
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Curated, provider-native creator feeds. Every connected account gets its own
 * rail; media opens in the shared CORE player while true document posts retain
 * their canonical, safely validated provider link.
 */
export const CreatorPlatformRails = memo(function CreatorPlatformRails({
  channelName,
  channelSlug,
  items,
  onPlay,
  maxItemsPerSource = 20_000,
  initialItemsPerSource = INITIAL_MEDIA_ITEMS,
  sources = [],
  sourceLinks = [],
  className = "",
  archiveEndpoint,
  railTotals,
}: CreatorPlatformRailsProps) {
  const discovery = useWatchDiscovery();
  const handleFeedback = useCallback((item: WatchItem, value: WatchFeedbackValue | null) => {
    discovery.setFeedback(item.id, value);
  }, [discovery.setFeedback]);
  const rails = useMemo(
    () => buildCuratedChannelRails(items, { maxItemsPerSource, sources }),
    [items, maxItemsPerSource, sources],
  );
  const links = useMemo(
    () => new Map(sourceLinks.map((entry) => [entry.sourceKey, {
      href: safeExternalUrl(entry.href),
      label: entry.label,
    }])),
    [sourceLinks],
  );
  const xPosts = useMemo(() => {
    const xItems = items.filter((item) => item.platform === "x");
    const memberSlugs = new Set(xItems.flatMap((item) => item.memberSlug ? [item.memberSlug] : []));
    const byMember = [...memberSlugs].flatMap((slug) => {
      const member = MEMBERS_BY_SLUG[slug];
      if (!member) return [];
      return [{
        slug,
        label: member.stageName,
        accent: member.accent,
        portrait: member.portrait,
        comm: member.comm.logo,
        items: xItems.filter((item) => item.memberSlug === slug),
      }];
    });
    return selectWatchHomeXPosts({
      byMember,
      byPlatform: {
        twitch: [],
        youtube: [],
        tiktok: [],
        instagram: [],
        x: xItems,
        house: [],
      },
    }, {
      limit: Math.min(48, Math.max(1, maxItemsPerSource * Math.max(1, byMember.length))),
      perMember: Math.min(8, Math.max(1, maxItemsPerSource)),
    });
  }, [items, maxItemsPerSource]);

  // Instagram and TikTok are first-class creator feeds. Keep a configured
  // source visible when its adapter is empty so the official public embed can
  // take over without replacing any real feed items that do arrive.
  const contentRails = rails.filter(shouldRenderRail);
  const tiktokEmbedSignature = contentRails
    .filter((rail) => rail.platform === "tiktok" && shouldUseOfficialEmbedFallback(rail))
    .map((rail) => `${rail.id}:${rail.handle ?? rail.sourceHref ?? "invalid"}`)
    .join("|");

  if (!contentRails.length) return null;

  return (
    <section className={`${styles.section} ${className}`.trim()} aria-labelledby="creator-platform-rails-heading">
      <div className={styles.intro}>
        <span>Creator platforms</span>
        <h2 id="creator-platform-rails-heading">From {channelName}</h2>
        <p>Every available video plus fresh posts, broadcasts, Shorts, and live rooms from each official source.</p>
      </div>

      <div className={styles.rails}>
        {contentRails.map((rail) => {
          const sourceLink = links.get(rail.sourceKey);
          const officialHref = sourceLink?.href ?? safeExternalUrl(rail.sourceHref);
          const usesOfficialEmbedFallback = shouldUseOfficialEmbedFallback(rail);
          return (
            <section key={rail.id} className={styles.railSection} aria-labelledby={`creator-source-${rail.id}`}>
              <div className={`watch-shelf-heading ${styles.railHeading}`}>
                <span className={styles.headingCopy}>
                  <strong id={`creator-source-${rail.id}`}>{rail.sourceLabel}</strong>
                  <small>
                    {!usesOfficialEmbedFallback && rail.items.length
                      ? `${PLATFORM_LABEL[rail.platform]} · ${RAIL_KIND_LABEL[rail.kind]} · ${(railTotals?.[rail.id] ?? rail.items.length).toLocaleString()} available`
                      : `${PLATFORM_LABEL[rail.platform]} · ${emptySourceStatus(rail)}`}
                  </small>
                </span>
                {officialHref ? (
                  <a href={officialHref} target="_blank" rel="noopener noreferrer">
                    {sourceLink?.label ?? `Open ${PLATFORM_LABEL[rail.platform]}`}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              {rail.platform === "x" ? (
                <XSourceRail rail={rail} posts={xPosts} />
              ) : usesOfficialEmbedFallback ? (
                <OfficialSocialEmbedFallback rail={rail} />
              ) : (
                <MediaSourceRail rail={rail} channelSlug={channelSlug} onPlay={onPlay} initialCount={initialItemsPerSource} archiveEndpoint={archiveEndpoint} total={railTotals?.[rail.id]} feedback={discovery.state.feedback} onFeedback={handleFeedback} />
              )}
            </section>
          );
        })}
      </div>
      <TikTokEmbedScriptLoader signature={tiktokEmbedSignature} />
    </section>
  );
});
