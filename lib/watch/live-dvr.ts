type LiveDvrItem = {
  kind?: string | null;
  platform?: string | null;
  dvr?: {
    enabled?: boolean;
    windowSeconds?: number;
    twitchVodId?: string;
  } | null;
};

function finiteSeconds(value: number | null | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Number(value) : 0;
}

/** Return a usable growing Twitch archive window, or zero when rewind is unavailable. */
export function twitchLiveDvrWindowSeconds(
  item: LiveDvrItem | null | undefined,
  providerDuration = 0,
): number {
  if (
    item?.kind !== "live"
    || item.platform !== "twitch"
    || item.dvr?.enabled !== true
    || !item.dvr.twitchVodId?.trim()
  ) return 0;

  return Math.max(
    finiteSeconds(item.dvr.windowSeconds),
    finiteSeconds(providerDuration),
  );
}

export function clampLiveDvrPosition(position: number, windowSeconds: number): number {
  const duration = finiteSeconds(windowSeconds);
  if (!duration || !Number.isFinite(position)) return 0;
  return Math.min(duration, Math.max(0, position));
}

export function liveDvrProgressPercent(position: number, windowSeconds: number): number {
  const duration = finiteSeconds(windowSeconds);
  if (!duration) return 100;
  return (clampLiveDvrPosition(position, duration) / duration) * 100;
}

export function liveDvrBehindSeconds(position: number, windowSeconds: number): number {
  const duration = finiteSeconds(windowSeconds);
  return Math.max(0, duration - clampLiveDvrPosition(position, duration));
}

/** A click at the live edge remains live; anything meaningfully behind opens the growing VOD. */
export function shouldEnterLiveDvr(position: number, windowSeconds: number): boolean {
  return liveDvrBehindSeconds(position, windowSeconds) > 1;
}
