export const INTRO_VIDEO_URL = "/intro/core-welcome-v1.mp4";
/** Size of the shipped file; used only when a response omits Content-Length. */
export const INTRO_VIDEO_BYTES = 8_395_517;
export const INTRO_SEEN_KEY = "coreboys:welcome-seen";
export const INTRO_SEEN_COOKIE = "core_welcome_seen";
export const HOME_INTRO_PRELOAD_EVENT = "core:home-intro-preload";
/** The boot terminal stays up at least this long so its lines can be read. */
export const INTRO_START_DELAY_MS = 2_400;
/** Missing portraits never hold the intro longer than this. */
export const INTRO_PORTRAIT_GRACE_MS = 6_000;
/** End credits hold this long before the intro opens into Home. */
export const INTRO_CREDITS_MS = 9_000;

export type IntroCuePlacement = "top-start" | "top-end" | "bottom-start" | "bottom-end";
export type IntroNameCue = {
  /** A `lib/members.ts` slug. */
  slug: string;
  /** Seconds into the video when the name is said and titled on screen. */
  at: number;
  /** Seconds when the name card leaves. */
  until: number;
  /** Which edge of the video the card rises from. */
  placement: IntroCuePlacement;
};

/**
 * The one editable list of name cues for `core-welcome-v1.mp4`. Each `at` is
 * the first frame of that friend's on-screen title, measured from the file
 * (ffmpeg, 4 fps). Replace these when the video changes.
 */
export const INTRO_NAME_CUES: readonly IntroNameCue[] = [
  { slug: "jason", at: 13.2, until: 16.0, placement: "top-start" },
  { slug: "ron", at: 16.2, until: 19.4, placement: "bottom-end" },
  { slug: "lacy", at: 20.0, until: 23.4, placement: "top-end" },
  { slug: "adapt", at: 25.5, until: 28.9, placement: "bottom-start" },
  { slug: "silky", at: 29.5, until: 32.9, placement: "top-start" },
  { slug: "marlon", at: 34.0, until: 37.6, placement: "bottom-end" },
];

/** Credited at the end, after the cast. Keep every line true. */
export const INTRO_CREDITS: readonly { role: string; name: string }[] = [
  { role: "Intro edit", name: "@underscoreemmaa" },
  { role: "Site built by", name: "@berryeyu" },
];

export function hasSeenIntro(storage: Pick<Storage, "getItem"> | null, cookies = ""): boolean {
  try { if (storage?.getItem(INTRO_SEEN_KEY) === "1") return true; } catch { /* Cookie fallback. */ }
  return cookies.split(";").some((cookie) => cookie.trim() === `${INTRO_SEEN_COOKIE}=1`);
}

export function rememberIntro(storage: Pick<Storage, "setItem"> | null): void {
  try { storage?.setItem(INTRO_SEEN_KEY, "1"); } catch { /* The UI also writes a first-party cookie. */ }
}

export function introCreditVisible(position: number, duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && position >= Math.max(0, duration - 4);
}

/** The cue whose card is on screen at `position`, if any. */
export function activeIntroCue(position: number, cues: readonly IntroNameCue[] = INTRO_NAME_CUES): IntroNameCue | null {
  return cues.find((cue) => position >= cue.at && position < cue.until) ?? null;
}

/** How many friends have been named by `position`. */
export function introCastRevealed(position: number, cues: readonly IntroNameCue[] = INTRO_NAME_CUES): number {
  return cues.filter((cue) => position >= cue.at).length;
}

export type IntroCueState = "waiting" | "on" | "done";
export function introCueState(cue: IntroNameCue, position: number): IntroCueState {
  if (position < cue.at) return "waiting";
  return position < cue.until ? "on" : "done";
}

/** Each part of the real preload, 0–1. */
export type IntroPreloadParts = { video: number; decode: number; shelves: number; artwork: number; portraits: number };
export const INTRO_PRELOAD_WEIGHTS: Readonly<IntroPreloadParts> = { video: 0.55, decode: 0.05, shelves: 0.1, artwork: 0.15, portraits: 0.15 };

export function introPreloadPercent(parts: IntroPreloadParts): number {
  let total = 0;
  for (const key of Object.keys(INTRO_PRELOAD_WEIGHTS) as (keyof IntroPreloadParts)[]) {
    const value = parts[key];
    total += INTRO_PRELOAD_WEIGHTS[key] * (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
  }
  return Math.min(100, Math.floor(total * 100 + 1e-9));
}

export function introFraction(done: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
}
