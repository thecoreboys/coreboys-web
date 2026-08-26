export type PreviewPlaybackSample = {
  positionSeconds: number | null;
  durationSeconds: number | null;
  playing: boolean | null;
};

function finiteSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Reads the time payloads emitted by the provider embeds used in hover
 * previews. Other postMessage traffic is deliberately ignored.
 */
export function previewPlaybackSample(payload: unknown): PreviewPlaybackSample | null {
  let message = payload;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message) as unknown;
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== "object") return null;

  const value = message as Record<string, unknown>;
  let detail: Record<string, unknown> | null = null;
  let playing: boolean | null = null;
  if (value.event === "infoDelivery" && value.info && typeof value.info === "object") {
    detail = value.info as Record<string, unknown>;
    if (typeof detail.playerState === "number") {
      playing = detail.playerState === 1
        ? true
        : [-1, 0, 2, 3, 5].includes(detail.playerState)
          ? false
          : null;
    }
  } else if (value.event === "onStateChange" && typeof value.info === "number") {
    playing = value.info === 1
      ? true
      : [-1, 0, 2, 3, 5].includes(value.info)
        ? false
        : null;
  } else if (value.event === "onAutoplayBlocked") {
    playing = false;
  } else if (
    value["x-tiktok-player"] === true &&
    value.type === "onCurrentTime" &&
    value.value &&
    typeof value.value === "object"
  ) {
    detail = value.value as Record<string, unknown>;
  } else if (
    value["x-tiktok-player"] === true &&
    value.type === "onStateChange" &&
    typeof value.value === "number"
  ) {
    playing = value.value === 1
      ? true
      : [-1, 0, 2, 3].includes(value.value)
        ? false
        : null;
  } else if (
    value["x-tiktok-player"] === true &&
    value.type === "onPlayerError"
  ) {
    playing = false;
  }

  const positionSeconds = finiteSeconds(detail?.currentTime);
  const durationSeconds = finiteSeconds(detail?.duration);
  return positionSeconds == null && durationSeconds == null && playing == null
    ? null
    : { positionSeconds, durationSeconds, playing };
}

export function clampPreviewPosition(positionSeconds: number, durationSeconds: number): number {
  const position = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return duration > 0 ? Math.min(duration, position) : position;
}
