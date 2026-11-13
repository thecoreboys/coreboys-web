/**
 * Player preferences live in two places: this device (localStorage, written
 * by PlayerProvider whenever a setting changes, including from in-player
 * menus) and the account copy (written by Account settings). Each side keeps
 * a timestamp so the newer choice wins instead of whichever loads last.
 */

export const PLAYER_PREFS_STORAGE_KEY = "core-player-prefs:v2";

type Stamped<T> = T & { updatedAt?: string };

const NEVER_CHANGED = new Date(0).toISOString();

function stripStamp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rest = { ...(value as Record<string, unknown>) };
  delete rest.updatedAt;
  return JSON.stringify(rest);
}

/**
 * Stamp the preferences about to be stored. Re-writing identical values (the
 * provider persists on every render that touches a preference dependency)
 * keeps the previous timestamp, so only a real change moves the clock.
 */
export function stampPlayerPrefs<T extends Record<string, unknown>>(
  prefs: T,
  previousRaw: string | null,
  now: Date = new Date(),
): Stamped<T> {
  let previous: unknown = null;
  try {
    previous = previousRaw ? JSON.parse(previousRaw) : null;
  } catch {
    previous = null;
  }
  const previousStamp = previous && typeof previous === "object"
    ? (previous as { updatedAt?: unknown }).updatedAt
    : undefined;
  const unchanged = stripStamp(previous) === JSON.stringify(prefs);
  if (typeof previousStamp === "string" && Number.isFinite(Date.parse(previousStamp)) && unchanged) {
    return { ...prefs, updatedAt: previousStamp };
  }
  // A first write (fresh device: defaults) or an unchanged record from a build
  // without stamps is not a viewer's choice. The epoch lets the account copy win.
  if (!previous || unchanged) return { ...prefs, updatedAt: NEVER_CHANGED };
  return { ...prefs, updatedAt: now.toISOString() };
}

/** Milliseconds of the last local preference change, or 0 when unknown. */
export function localPlayerPrefsUpdatedAt(raw: string | null): number {
  try {
    const parsed = raw ? JSON.parse(raw) as { updatedAt?: unknown } : null;
    const stamp = typeof parsed?.updatedAt === "string" ? Date.parse(parsed.updatedAt) : NaN;
    return Number.isFinite(stamp) ? stamp : 0;
  } catch {
    return 0;
  }
}

/**
 * Apply the account copy only when it is at least as new as this device's
 * last change. A device that has never stamped (older build, first visit)
 * takes the account copy.
 */
export function remotePlayerPrefsWin(remoteUpdatedAt: string | null | undefined, localUpdatedAtMs: number): boolean {
  if (!localUpdatedAtMs) return true;
  const remote = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : NaN;
  if (!Number.isFinite(remote)) return false;
  return remote >= localUpdatedAtMs;
}
