import type { FeedItem } from "@/components/feed/types";

const SHORT_LABEL = /(?:^|\s)#?shorts?(?:\s|$|[.!?])/i;
const YOUTUBE_VIDEO_ID = /^[0-9A-Za-z_-]{11}$/;

export type YouTubeShortSignals = {
  durationSeconds?: number | null;
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
};

/**
 * YouTube exposes duration and text signals but no authoritative `isShort`
 * field. Preserve the legacy <=60 second rule and require an explicit Shorts
 * label for newer uploads up to three minutes long.
 */
export function isLikelyYouTubeShort(signals: YouTubeShortSignals): boolean {
  const duration = signals.durationSeconds;
  const labelled = SHORT_LABEL.test([
    signals.title ?? "",
    signals.description ?? "",
    ...(signals.tags ?? []),
  ].join(" "));
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return labelled;
  return duration <= 60 || (duration <= 180 && labelled);
}

export type YouTubeFeedMetadata = {
  duration: string;
  durationSeconds: number;
  isShort: boolean;
  liveBroadcastContent?: "live" | "upcoming" | "none";
};

function normalizedVideoId(value: string | null | undefined): string | null {
  const candidate = value?.trim().replace(/^(?:youtube:|yt-)/i, "") ?? "";
  return YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
}

/** Resolve one immutable YouTube id from an RSS-derived feed card. */
export function youtubeVideoIdForFeedItem(item: FeedItem): string | null {
  if (item.platform !== "youtube") return null;
  const canonical = normalizedVideoId(item.canonicalProviderId);
  if (canonical) return canonical;

  for (const rawUrl of [item.sourceUrl, item.url]) {
    if (!rawUrl) continue;
    try {
      const url = new URL(rawUrl);
      const queryId = normalizedVideoId(url.searchParams.get("v"));
      if (queryId) return queryId;
      const pathId = normalizedVideoId(
        url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/i)?.[1]
          ?? (url.hostname === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : null),
      );
      if (pathId) return pathId;
    } catch {
      // Fall through to the provider-prefixed feed id.
    }
  }
  return normalizedVideoId(item.id);
}

/**
 * Apply one batched videos.list result before durable event normalization.
 * This prevents an RSS text guess from winning the canonical-id race against
 * a later WebSub callback that already knows the upload's duration.
 */
export function applyYouTubeMetadataToFeedItems(
  items: readonly FeedItem[],
  metadata: Readonly<Record<string, YouTubeFeedMetadata>>,
): FeedItem[] {
  return items.map((item) => {
    const videoId = youtubeVideoIdForFeedItem(item);
    const details = videoId ? metadata[videoId] : undefined;
    if (!videoId || !details || item.isLive || item.format === "live") return item;
    const sourceUrl = details.isShort
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`;
    return {
      ...item,
      canonicalProviderId: videoId,
      url: sourceUrl,
      sourceUrl,
      mediaType: "video",
      format: details.isShort ? "short" : "long",
      orientation: details.isShort ? "portrait" : "landscape",
      duration: details.duration,
      durationSeconds: details.durationSeconds,
    };
  });
}
