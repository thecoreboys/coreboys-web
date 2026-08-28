import type { FeedItem } from "@/components/feed/types";
import type { SocialContentType } from "@/lib/social-alert";

// Instagram Reels are polled on a two-hour provider-credit window. Leave an
// extra hour for scheduler jitter so a Reel published just after one poll is
// still eligible when the next durable refresh discovers it.
export const DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS = 3 * 60 * 60 * 1_000;
const MAX_SOCIAL_NOTIFICATION_AGE_HOURS = 7 * 24;
const MAX_SOCIAL_EVENT_FUTURE_SKEW_MS = 5 * 60 * 1_000;

/** Keep event eligibility and queued-delivery expiry on one bounded window. */
export function socialNotificationMaxAgeMs(
  configuredHours: string | number | null | undefined = process.env.SOCIAL_NOTIFICATION_MAX_AGE_HOURS,
): number {
  const hours = Number(configuredHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS;
  }
  return Math.min(MAX_SOCIAL_NOTIFICATION_AGE_HOURS, hours) * 60 * 60 * 1_000;
}

function cleanProviderId(value: string, prefixes: readonly string[]): string {
  let id = value.trim();
  for (const prefix of prefixes) {
    if (id.toLowerCase().startsWith(prefix)) {
      id = id.slice(prefix.length);
      break;
    }
  }
  return id;
}

function pathnameMatch(value: string | undefined, pattern: RegExp): string | null {
  if (!value) return null;
  try {
    const match = new URL(value).pathname.match(pattern);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Map every ingestion path for the same provider object onto one stable key.
 * Feed adapters intentionally use UI-specific prefixes (`yt-`, `tt-`, etc.);
 * those must never leak into the durable event identity used by webhooks.
 */
export function canonicalSocialEventId(item: FeedItem): string {
  const sourceUrl = item.sourceUrl ?? item.url;
  const canonicalProviderId = item.canonicalProviderId?.trim();

  if (item.platform === "youtube") {
    let videoId: string | null = null;
    try {
      const url = new URL(sourceUrl);
      videoId = url.searchParams.get("v")?.trim()
        || pathnameMatch(sourceUrl, /\/(?:shorts|embed|live)\/([^/?#]+)/i);
    } catch {
      // Fall through to the feed id. Invalid URLs are rejected by the caller.
    }
    return `youtube:${videoId || cleanProviderId(item.id, ["youtube:", "yt-"])}`;
  }

  if (item.platform === "tiktok") {
    const videoId = (canonicalProviderId
      ? cleanProviderId(canonicalProviderId, ["tiktok:", "tt-"])
      : null)
      || pathnameMatch(sourceUrl, /\/video\/([^/?#]+)/i)
      || cleanProviderId(item.id, ["tiktok:", "tt-"]);
    return `tiktok:${videoId}`;
  }

  if (item.platform === "instagram") {
    const mediaId = canonicalProviderId
      ? cleanProviderId(canonicalProviderId, ["instagram:", "ig-"])
      : cleanProviderId(item.id, ["instagram:", "ig-"]);
    return `instagram:${mediaId}`;
  }

  const statusId = item.x?.statusId?.trim()
    || pathnameMatch(sourceUrl, /\/status\/(\d+)/i)
    || cleanProviderId(item.id, ["x:", "x-"]).match(/^\d+/)?.[0]
    || cleanProviderId(item.id, ["x:", "x-"]);
  return `x:${statusId}`;
}

export function socialContentTypeForFeedItem(item: FeedItem): SocialContentType {
  if (item.isLive || item.format === "live") return "live";
  // An X status is one post even when the feed renders its media as separate
  // image/video cards. This also keeps rule matching and dedupe consistent.
  if (item.platform === "x") return "post";
  if (item.format === "photo" || item.mediaType === "image") return "photo";
  if (item.format === "short") return "short";
  return "video";
}

export function isFreshSocialEvent(
  publishedAt: string | number | Date,
  nowMs = Date.now(),
  maxAgeMs = DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS,
): boolean {
  const publishedMs = publishedAt instanceof Date
    ? publishedAt.getTime()
    : typeof publishedAt === "number"
      ? publishedAt
      : Date.parse(publishedAt);
  return Number.isFinite(publishedMs)
    && Number.isFinite(nowMs)
    && Number.isFinite(maxAgeMs)
    && maxAgeMs >= 0
    && publishedMs <= nowMs + MAX_SOCIAL_EVENT_FUTURE_SKEW_MS
    && nowMs - publishedMs <= maxAgeMs;
}
