export type YouTubeSubscriptionVerification =
  | { status: "subscribed" }
  | { status: "not_subscribed" }
  | { status: "unknown"; reason: string };

const YOUTUBE_CHANNEL_ID = /^UC[0-9A-Za-z_-]{22}$/;
const YOUTUBE_HANDLE = /^[0-9A-Za-z_.-]{3,30}$/;

export function normalizeYouTubeChannelId(value: string | null | undefined): string | null {
  const channelId = value?.trim() ?? "";
  return YOUTUBE_CHANNEL_ID.test(channelId) ? channelId : null;
}

export function normalizeYouTubeHandle(value: string | null | undefined): string | null {
  const handle = value?.trim().replace(/^@+/, "") ?? "";
  return YOUTUBE_HANDLE.test(handle) ? handle : null;
}

/**
 * Build YouTube's channel subscription-confirmation URL without accepting a
 * caller-controlled host or path. Immutable channel ids are preferred, with a
 * roster-owned handle as the fallback for channels that have not stored one.
 */
export function youtubeSubscribeHref(input: {
  channelId?: string | null;
  handle?: string | null;
}): string | null {
  const channelId = normalizeYouTubeChannelId(input.channelId);
  if (channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}?sub_confirmation=1`;
  }
  const handle = normalizeYouTubeHandle(input.handle);
  return handle
    ? `https://www.youtube.com/@${encodeURIComponent(handle)}?sub_confirmation=1`
    : null;
}

/**
 * A successful, empty subscriptions.list result is the only evidence that the
 * viewer is not subscribed. Auth, quota, provider, and malformed responses stay
 * unknown so an account sync cannot erase a previously confirmed fact.
 */
export function parseYouTubeSubscriptionResponse(
  status: number,
  payload: unknown,
): YouTubeSubscriptionVerification {
  if (status !== 200 || !payload || typeof payload !== "object") {
    return { status: "unknown", reason: `youtube_${status}` };
  }
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return { status: "unknown", reason: "youtube_malformed" };
  return items.length > 0 ? { status: "subscribed" } : { status: "not_subscribed" };
}
