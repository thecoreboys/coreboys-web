import type { FeedItem } from "@/components/feed/types";
import { MEMBERS } from "@/lib/members";
import type { PublicXFeedSnapshot } from "@/lib/x-feed-snapshot";
import type { PublicXFeedStatus } from "@/lib/x-feed-freshness";
import type { WatchCatalog, WatchItem } from "./types";
import { selectWatchHomeXPosts, type WatchHomeXPost } from "./x-posts";
import { crewXAuthorSlug } from "@/lib/x/crew-roster";

export type LiveXFeedResponse = {
  members: WatchHomeXPost[];
  crew: WatchHomeXPost[];
  refreshedAt: string | null;
  checkedAt: string;
  status: PublicXFeedStatus;
  /** Upstream collection cadence; the browser checks the saved feed every 15s. */
  refreshIntervalSeconds: number;
  /** Last received signed streaming event; independent of roster freshness. */
  streamReceivedAt?: string | null;
};

function xWatchItem(item: FeedItem): WatchItem {
  const member = MEMBERS.find((candidate) => candidate.slug === item.authorSlug);
  const photo = item.mediaType === "image" || item.mediaType === "animated_gif";
  const poster = item.thumbnailUrl ?? (photo ? item.mediaUrl : undefined) ?? "";
  return {
    id: item.id,
    kind: item.isLive ? "live" : photo ? "tour" : item.mediaType === "video" ? "clip" : "post",
    platform: "x",
    title: item.title,
    subtitle: item.authorLabel,
    memberSlug: item.authorSlug,
    memberLabel: member?.stageName ?? item.authorLabel,
    accountLabel: item.authorLabel,
    accent: member?.accent ?? "#db0368",
    poster,
    backdrop: poster,
    href: item.sourceUrl ?? item.url,
    sourceUrl: item.sourceUrl ?? item.url,
    publishedAt: item.publishedAt,
    mediaUrl: item.mediaUrl,
    orientation: item.orientation,
    width: item.width,
    height: item.height,
    format: photo ? "photo" : undefined,
    ...(item.isLive ? { live: { startedAt: item.publishedAt } } : {}),
    x: item.x,
  };
}

/** Crew profiles read only their own posts from the shared, cached snapshot. */
export function selectCrewProfileXPosts(snapshot: Pick<PublicXFeedSnapshot, "items">, slug: string): WatchHomeXPost[] {
  const authorSlug = crewXAuthorSlug(slug);
  return selectWatchHomeXPosts({
    byMember: [],
    byPlatform: {
      x: snapshot.items.filter((item) => item.platform === "x" && item.authorSlug === authorSlug).map(xWatchItem),
      twitch: [], youtube: [], instagram: [], tiktok: [], house: [],
    },
  }, { audience: "crew", limit: 12, perMember: 12 });
}

/** Shape both audiences from the same durable snapshot, without loading Watch. */
export function buildLiveXFeedResponse(
  snapshot: PublicXFeedSnapshot,
  nowMs = Date.now(),
): LiveXFeedResponse {
  const catalog: Pick<WatchCatalog, "byMember" | "byPlatform"> = {
    byMember: MEMBERS.map((member) => ({
      slug: member.slug, label: member.stageName, accent: member.accent,
      portrait: member.portrait, comm: member.comm.name, items: [],
    })),
    byPlatform: {
      x: snapshot.items.filter((item) => item.platform === "x").map(xWatchItem),
      twitch: [], youtube: [], instagram: [], tiktok: [], house: [],
    },
  };
  return {
    members: selectWatchHomeXPosts(catalog, { audience: "members", limit: 18, perMember: 3 }),
    crew: selectWatchHomeXPosts(catalog, { audience: "crew", limit: 24, perMember: 3 }),
    refreshedAt: snapshot.refreshedAt,
    checkedAt: new Date(nowMs).toISOString(),
    status: snapshot.status,
    refreshIntervalSeconds: snapshot.refreshIntervalSeconds,
    streamReceivedAt: snapshot.streamReceivedAt ?? null,
  };
}
