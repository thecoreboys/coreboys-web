"use client";

import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
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
    return `The configured ${platform} profile reference is invalid. Update the source before posts can load.`;
  }
  if (rail.ingestState === "not_configured") {
    return `${platform} is linked as a profile, but CORE does not have authorized media access for this account yet.`;
  }
  if (rail.ingestState === "scope_missing") {
    return `Reconnect this ${platform} account and approve its read-media permission to show recent posts.`;
  }
  if (rail.ingestState === "token_unavailable") {
    return `This ${platform} connection expired or could not refresh. Reconnect it to restore recent posts.`;
  }
  if (rail.ingestState === "vault_unavailable") {
    return `CORE cannot reach its encrypted social connection store right now. This feed will return when the service reconnects.`;
  }
  if (rail.ingestState === "ready") {
    return `${platform} is authorized, but the provider returned no recent posts for this account.`;
  }
  if (rail.platform === "x") {
    return "No cached posts are available from this account yet.";
  }
  return `No recent ${platform} posts are available from this account yet.`;
}

function XSourceRail({ rail, posts }: { rail: CuratedChannelRail; posts: readonly WatchHomeXPost[] }) {
  const ids = new Set(rail.items.map(statusIdOf).filter((value): value is string => Boolean(value)));
  const visible = posts.filter((post) => ids.has(post.statusId));
  if (!visible.length) {
    return <div className={styles.empty}>{emptySourceMessage(rail)}</div>;
  }
  return <XTweetsRail items={visible} title={`${rail.sourceLabel} latest posts`} maxItems={visible.length} showHeading={false} />;
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
  maxItemsPerSource = 12,
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

  if (!rails.length) return null;

  return (
    <section className={`${styles.section} ${className}`.trim()} aria-labelledby="creator-platform-rails-heading">
      <div className={styles.intro}>
        <span>Creator platforms</span>
        <h2 id="creator-platform-rails-heading">Latest from {channelName}</h2>
        <p>Fresh posts, videos, Shorts, broadcasts, and live rooms from every authorized account.</p>
      </div>

      <div className={styles.rails}>
        {rails.map((rail) => {
          const sourceLink = links.get(rail.sourceKey);
          const officialHref = sourceLink?.href ?? safeExternalUrl(rail.sourceHref);
          return (
            <section key={rail.id} className={styles.railSection} aria-labelledby={`creator-source-${rail.id}`}>
              <div className={`watch-shelf-heading ${styles.railHeading}`}>
                <span className={styles.headingCopy}>
                  <strong id={`creator-source-${rail.id}`}>{rail.sourceLabel}</strong>
                  <small>
                    {PLATFORM_LABEL[rail.platform]} · {RAIL_KIND_LABEL[rail.kind]} · {rail.items.length} latest
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
              ) : rail.items.length ? (
                <DragScrollRail
                  className={`watch-shelf ${styles.homeMediaRail}`}
                  role="region"
                  tabIndex={0}
                  aria-label={`${rail.sourceLabel} latest content`}
                >
                  {rail.items.map((item) => (
                    <PosterCard
                      key={`${item.platform}:${item.id}`}
                      item={item}
                      context={rail.items}
                      onPlay={onPlay}
                      hoverAutoplay
                    />
                  ))}
                </DragScrollRail>
              ) : (
                <div className={styles.empty}>{emptySourceMessage(rail)}</div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
