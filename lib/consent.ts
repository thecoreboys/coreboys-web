/**
 * Cookie-consent state. Persisted as the `coreboys-consent` cookie so it
 * survives reloads + tabs. The cookie value is one of:
 *   - "granted"   — analytics may load
 *   - "denied"    — analytics must not load
 *   - <missing>   — first visit; banner shows
 *
 * Anything that needs to know "is GA on" calls `hasAnalyticsConsent()`.
 * Anything that needs to react when the user toggles consent calls
 * `onConsentChange()`.
 */

const COOKIE = "coreboys-consent";
const TWELVE_MONTHS = 60 * 60 * 24 * 365;

type Listener = (granted: boolean) => void;
const listeners = new Set<Listener>();

function readCookie(): "granted" | "denied" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)coreboys-consent=([^;]+)/);
  const v = m?.[1];
  return v === "granted" || v === "denied" ? v : null;
}

function writeCookie(value: "granted" | "denied"): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=${value}; Max-Age=${TWELVE_MONTHS}; Path=/; SameSite=Lax`;
}

export function getConsent(): "granted" | "denied" | "unknown" {
  return readCookie() ?? "unknown";
}

export function hasAnalyticsConsent(): boolean {
  return readCookie() === "granted";
}

export function setConsent(granted: boolean): void {
  writeCookie(granted ? "granted" : "denied");
  for (const fn of listeners) fn(granted);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("coreboys:consent", { detail: { granted } }),
    );
  }
}

export function onConsentChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-opens the consent banner. Wired to the "Cookie settings" link. */
export function openConsentSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("coreboys:consent-open"));
}
