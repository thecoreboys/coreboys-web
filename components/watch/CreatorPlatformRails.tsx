"use client";

import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildCuratedChannelRails,
  type CuratedChannelPlatform,
  type CuratedChannelRail,
  type CuratedChannelSourceDescriptor,
} from "@/lib/watch/creator-platform-rails";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import type { WatchItem } from "@/lib/watch/types";
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
  items: readonly WatchItem[];
  onPlay: (item: WatchItem, sourceQueue: readonly WatchItem[]) => void;
  maxItemsPerSource?: number;
  sources?: readonly CuratedChannelSourceDescriptor[];
  sourceLinks?: readonly CreatorPlatformSourceLink[];
  className?: string;
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
  const platform = PLATFORM_LABEL[rail.platform];
  if (rail.ingestState === "invalid_account_ref") {
    return `This ${platform} profile link needs to be fixed before public content can load.`;
  }
  if (rail.ingestState === "not_configured") {
    return `${platform}'s automatic feed is not available.`;
  }
  if (rail.ingestState === "scope_missing") {
    return `${platform}'s automatic feed is not available with the current permissions.`;
  }
  if (rail.ingestState === "token_unavailable") {
    return `${platform}'s automatic feed could not refresh.`;
  }
  if (rail.ingestState === "vault_unavailable") {
    return `CORE could not refresh ${platform} right now.`;
  }
  if (rail.ingestState === "ready") {
    return `No recent items came back from ${platform}'s automatic feed.`;
  }
  if (rail.platform === "x") {
    return "No cached posts are available from this account yet.";
  }
  return `No recent ${platform} posts have been indexed for this profile yet.`;
}

function emptySourceStatus(rail: CuratedChannelRail): string {
  if (rail.ingestState === "invalid_account_ref") return "Profile configuration issue";
  if (rail.platform === "tiktok") return "Official public Creator Profile Embed";
  if (rail.platform === "instagram") return "Official public profile and post embeds";
  if (rail.ingestState === "ready") return "Media access ready · no recent items";
  if (rail.ingestState === "not_configured") return "Official profile · media access unavailable";
  if (rail.ingestState) return "Media connection needs attention";
  return "Official profile · awaiting indexed posts";
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
}: {
  rail: CuratedChannelRail;
  onPlay: (item: WatchItem, sourceQueue: readonly WatchItem[]) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_MEDIA_ITEMS);
  const visibleItems = rail.items.slice(0, visibleCount);
  const remaining = rail.items.length - visibleItems.length;
  const revealCount = Math.min(MEDIA_ITEMS_STEP, remaining);

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
            context={rail.items}
            onPlay={onPlay}
            hoverAutoplay
          />
        ))}
      </DragScrollRail>
      {remaining > 0 ? (
        <div className={styles.archiveControls}>
          <span>{visibleItems.length.toLocaleString()} of {rail.items.length.toLocaleString()} available</span>
          <button type="button" onClick={() => setVisibleCount((count) => count + MEDIA_ITEMS_STEP)}>
            Show {revealCount.toLocaleString()} more
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
export function CreatorPlatformRails({
  channelName,
  items,
  onPlay,
  maxItemsPerSource = 20_000,
  sources = [],
  sourceLinks = [],
  className = "",
}: CreatorPlatformRailsProps) {
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
                      ? `${PLATFORM_LABEL[rail.platform]} · ${RAIL_KIND_LABEL[rail.kind]} · ${rail.items.length.toLocaleString()} available`
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
                <MediaSourceRail rail={rail} onPlay={onPlay} />
              )}
            </section>
          );
        })}
      </div>
      <TikTokEmbedScriptLoader signature={tiktokEmbedSignature} />
    </section>
  );
}
