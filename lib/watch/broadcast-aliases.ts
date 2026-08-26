import type { WatchItem } from "./types";

const BROADCAST_PAIR_TOLERANCE_MS = 30 * 60 * 1000;

function timestamp(item: WatchItem): number | null {
  const parsed = Date.parse(item.live?.startedAt ?? item.publishedAt ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function titleFingerprint(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isKnownBroadcast(item: WatchItem): boolean {
  return item.kind === "live" || item.format === "live" || item.kind === "vod";
}

function isDedicatedYoutubeVod(item: WatchItem): boolean {
  if (item.platform !== "youtube" || item.kind !== "youtube" || item.format !== "long") return false;
  return [item.accountLabel, item.subtitle].some((label) => (
    typeof label === "string" && /(?:^|\s(?:[·|–—-]\s*)?)vods?\s*$/i.test(label.trim())
  ));
}

function isCrossPlatformBroadcastPair(video: WatchItem, broadcast: WatchItem): boolean {
  if (video.platform !== "youtube" || video.kind !== "youtube" || video.format !== "long") return false;
  if (broadcast.platform !== "twitch" || !isKnownBroadcast(broadcast)) return false;
  if (!video.memberSlug || video.memberSlug !== broadcast.memberSlug) return false;
  const videoAt = timestamp(video);
  const broadcastAt = timestamp(broadcast);
  if (videoAt === null || broadcastAt === null || Math.abs(videoAt - broadcastAt) > BROADCAST_PAIR_TOLERANCE_MS) {
    return false;
  }
  const videoTitle = titleFingerprint(video.title);
  const broadcastTitle = titleFingerprint(broadcast.title);
  return videoTitle.length >= 12 && videoTitle === broadcastTitle;
}

/**
 * RSS cannot identify a completed YouTube livestream without Data API
 * metadata. Dedicated VOD accounts are authoritative; otherwise, a matching
 * Twitch broadcast from the same creator and time window identifies the
 * YouTube record as an archive. Ordinary Main/Live uploads stay as videos.
 */
export function markCrossPlatformBroadcastAliases(items: readonly WatchItem[]): WatchItem[] {
  const broadcasts = items.filter(
    (item) => item.platform === "twitch" && isKnownBroadcast(item),
  );

  return items.map((item) => {
    const isBroadcast = isDedicatedYoutubeVod(item) || broadcasts.some(
      (broadcast) => isCrossPlatformBroadcastPair(item, broadcast),
    );
    if (!isBroadcast) return item;
    return {
      ...item,
      kind: "vod" as const,
      subtitle: `${item.memberLabel} · Past broadcast`,
      live: item.live ?? {
        startedAt: item.publishedAt,
        type: "video" as const,
      },
    };
  });
}
