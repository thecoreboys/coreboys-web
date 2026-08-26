"use client";

/**
 * Listener-side preferences for the prerecorded DJ Cora layer.
 *
 * These are deliberately separate from content playback: turning station
 * audio off never changes a Twitch/YouTube player, and no preference can
 * cause a new voice asset to be generated.  Local storage keeps the setting
 * useful before a visitor signs in; the account screen mirrors it to the
 * existing private settings store for signed-in fans.
 */

export type RadioCaptionPreference = "always" | "fallback" | "off";

export type RadioAudioSettings = {
  enabled: boolean;
  volume: number;
  captions: RadioCaptionPreference;
  /** Avoid metadata warmups on constrained connections. */
  dataSaver: boolean;
};

export const RADIO_AUDIO_SETTINGS_EVENT = "core:radio-audio-settings";
export const RADIO_AUDIO_SETTINGS_STORAGE_KEY = "core:radio-cora:settings:v1";

export const DEFAULT_RADIO_AUDIO_SETTINGS: RadioAudioSettings = {
  // This preserves the existing click-to-tune behavior. Browser autoplay
  // rules still protect any non-click-triggered line.
  enabled: true,
  volume: 0.72,
  captions: "always",
  dataSaver: false,
};

function inBrowser() {
  return typeof window !== "undefined";
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function captions(value: unknown): RadioCaptionPreference {
  return value === "fallback" || value === "off" || value === "always"
    ? value
    : DEFAULT_RADIO_AUDIO_SETTINGS.captions;
}

export function normalizeRadioAudioSettings(value: unknown): RadioAudioSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_RADIO_AUDIO_SETTINGS };
  const candidate = value as Partial<RadioAudioSettings>;
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : DEFAULT_RADIO_AUDIO_SETTINGS.enabled,
    volume: typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
      ? clamp(candidate.volume)
      : DEFAULT_RADIO_AUDIO_SETTINGS.volume,
    captions: captions(candidate.captions),
    dataSaver: typeof candidate.dataSaver === "boolean" ? candidate.dataSaver : DEFAULT_RADIO_AUDIO_SETTINGS.dataSaver,
  };
}

export function readRadioAudioSettings(): RadioAudioSettings {
  if (!inBrowser()) return { ...DEFAULT_RADIO_AUDIO_SETTINGS };
  try {
    return normalizeRadioAudioSettings(window.localStorage.getItem(RADIO_AUDIO_SETTINGS_STORAGE_KEY)
      ? JSON.parse(window.localStorage.getItem(RADIO_AUDIO_SETTINGS_STORAGE_KEY)!)
      : null);
  } catch {
    return { ...DEFAULT_RADIO_AUDIO_SETTINGS };
  }
}

export function writeRadioAudioSettings(
  patch: Partial<RadioAudioSettings> | RadioAudioSettings,
): RadioAudioSettings {
  const next = normalizeRadioAudioSettings({ ...readRadioAudioSettings(), ...patch });
  if (!inBrowser()) return next;
  try {
    window.localStorage.setItem(RADIO_AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private browsing. The emitted event still
    // updates the mounted director for the current visit.
  }
  window.dispatchEvent(new CustomEvent<RadioAudioSettings>(RADIO_AUDIO_SETTINGS_EVENT, { detail: next }));
  return next;
}
