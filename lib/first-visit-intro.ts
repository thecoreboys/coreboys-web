export const INTRO_VIDEO_URL = "/intro/core-welcome-v1.mp4";
export const INTRO_SEEN_KEY = "coreboys:welcome-seen";
export const INTRO_SEEN_COOKIE = "core_welcome_seen";
export const HOME_INTRO_PRELOAD_EVENT = "core:home-intro-preload";
export const INTRO_START_DELAY_MS = 1_500;

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
