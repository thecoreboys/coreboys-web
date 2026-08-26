import type { WatchItem } from "./types";

const START_TOLERANCE_MS = 2 * 60_000;

function channelIdentity(item: WatchItem): string {
  return (item.memberSlug || item.live?.login || "").trim().toLowerCase();
}

function itemStart(item: WatchItem): number {
  return Date.parse(item.live?.startedAt ?? item.publishedAt ?? "");
}

/**
 * Twitch exposes an active stream's growing recording through Get Videos.
 * Prefer Twitch's exact stream id and fail over to a tight time/channel join
 * only for older payloads that do not include provider ids.
 */
export function isCurrentTwitchArchive(archive: WatchItem, live: WatchItem): boolean {
  if (archive.platform !== "twitch" || archive.kind !== "vod") return false;
  if (live.platform !== "twitch" || live.kind !== "live") return false;
  const archiveChannel = channelIdentity(archive);
  const liveChannel = channelIdentity(live);
  if (!archiveChannel || archiveChannel !== liveChannel) return false;

  const archiveStreamId = archive.twitch?.streamId?.trim();
  const liveStreamId = live.twitch?.streamId?.trim() || live.live?.streamId?.trim();
  if (archiveStreamId && liveStreamId) return archiveStreamId === liveStreamId;

  const archiveStart = itemStart(archive);
  const liveStart = itemStart(live);
  if (!Number.isFinite(archiveStart) || !Number.isFinite(liveStart)) return false;
  if (Math.abs(archiveStart - liveStart) > START_TOLERANCE_MS) return false;

  // Preserve a completed short stream followed by a quick restart.
  const archiveDuration = archive.durationSeconds;
  if (!Number.isFinite(archiveDuration) || !archiveDuration || archiveDuration <= 0) return true;
  return archiveStart + archiveDuration * 1_000 >= liveStart;
}

export type TwitchArchiveReconciliation = {
  broadcasts: WatchItem[];
  liveItems: WatchItem[];
};

/** Hide the growing VOD and attach it as rewind transport to the live card. */
export function reconcileActiveTwitchArchives(
  broadcasts: readonly WatchItem[],
  liveItems: readonly WatchItem[],
): TwitchArchiveReconciliation {
  const hidden = new Set<string>();
  const reconciledLive = liveItems.map((live) => {
    const archive = broadcasts.find((candidate) => isCurrentTwitchArchive(candidate, live));
    if (!archive) return live;
    hidden.add(`${archive.platform}:${archive.id}`);
    const vodId = archive.twitch?.vodId;
    if (!vodId) return live;
    return {
      ...live,
      dvr: {
        enabled: true as const,
        twitchVodId: vodId,
        windowSeconds: archive.durationSeconds,
      },
    };
  });

  return {
    broadcasts: broadcasts.filter((item) => !hidden.has(`${item.platform}:${item.id}`)),
    liveItems: reconciledLive,
  };
}
