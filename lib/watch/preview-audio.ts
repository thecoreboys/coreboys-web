export const DEFAULT_PREVIEW_VOLUME = 0.35;
export const PREVIEW_AUDIO_CLAIM_EVENT = "core:preview-audio-claim";

export type PreviewAudioStatus = "off" | "starting" | "on" | "blocked" | "unavailable";

export type PreviewAudioSample = {
  muted: boolean | null;
  volume: number | null;
  playing: boolean | null;
};

export type PreviewAudioOwnerAction =
  | { type: "claim"; ownerId: string }
  | { type: "release"; ownerId: string };

type MainPlayerAudioSource = {
  platform?: string | null;
  format?: string | null;
};

/**
 * TikTok and Instagram embeds do not expose a dependable volume snapshot and
 * restore contract. Suppressing hover audio avoids two audible players and is
 * safer than muting a provider that we cannot truthfully restore afterward.
 */
export function previewAudioSuppressionReason(
  current: MainPlayerAudioSource | null | undefined,
): string | null {
  if (!current || current.format === "photo") return null;
  if (current.platform === "tiktok") {
    return "Preview audio is unavailable while TikTok is active in the main player because its volume cannot be safely lowered and restored.";
  }
  if (current.platform === "instagram") {
    return "Preview audio is unavailable while Instagram is active in the main player because its volume cannot be safely lowered and restored.";
  }
  return null;
}

/** A stale preview may release only its own lease, never a newer owner's. */
export function nextPreviewAudioOwner(
  currentOwner: string | null,
  action: PreviewAudioOwnerAction,
): string | null {
  const ownerId = action.ownerId.trim();
  if (!ownerId) return currentOwner;
  if (action.type === "claim") return ownerId;
  return currentOwner === ownerId ? null : currentOwner;
}

export function normalizePreviewVolume(
  value: unknown,
  fallback = DEFAULT_PREVIEW_VOLUME,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0.05, value));
}

/**
 * Produces a small, monotonic ramp for preview and ducking fades. The caller
 * owns the timing so this stays deterministic and testable outside a browser.
 */
export function previewVolumeRamp(from: number, to: number, steps = 6): number[] {
  const start = Math.min(1, Math.max(0, Number.isFinite(from) ? from : 0));
  const end = Math.min(1, Math.max(0, Number.isFinite(to) ? to : 0));
  const count = Math.max(1, Math.min(12, Math.round(steps)));
  return Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / count;
    return start + (end - start) * progress;
  });
}

/** Reads the mute/volume fields YouTube emits after its listening handshake. */
export function previewAudioSample(payload: unknown): PreviewAudioSample | null {
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
  if (value.event !== "infoDelivery" || !value.info || typeof value.info !== "object") {
    return null;
  }
  const info = value.info as Record<string, unknown>;
  const muted = typeof info.muted === "boolean" ? info.muted : null;
  const volume = typeof info.volume === "number" && Number.isFinite(info.volume)
    ? Math.min(1, Math.max(0, info.volume / 100))
    : null;
  const playing = typeof info.playerState === "number"
    ? info.playerState === 1
    : null;
  return muted == null && volume == null && playing == null
    ? null
    : { muted, volume, playing };
}

export function previewAudioStatusLabel(status: PreviewAudioStatus): string {
  if (status === "on") return "Sound on";
  if (status === "starting") return "Turning sound on…";
  if (status === "blocked") return "Muted by browser";
  if (status === "unavailable") return "Audio unavailable";
  return "Sound off";
}
