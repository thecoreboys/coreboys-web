const HOUR_MS = 60 * 60_000;

/** Production render paths fail closed when the scheduled snapshot is a day old. */
export const X_FEED_PUBLIC_MAX_AGE_HOURS = 24;

/**
 * Local QA has no hourly scheduler, so it may render the last protected
 * snapshot for one week. This does not permit an upstream request and is never
 * used in production.
 */
export const X_FEED_LOCAL_QA_MAX_AGE_HOURS = 7 * 24;

export type PublicXFeedStatus = "fresh" | "stale" | "empty" | "unavailable";

/** A readable history snapshot is not necessarily a timely live feed. */
export function publicXFeedStatus(input: {
  available: boolean;
  refreshedAt: string | null;
  itemCount: number;
  refreshIntervalSeconds: number;
  failed?: boolean;
}, nowMs = Date.now()): PublicXFeedStatus {
  if (!input.available) return "unavailable";
  if (!input.refreshedAt) return input.failed ? "unavailable" : "empty";
  const refreshedMs = Date.parse(input.refreshedAt);
  const ageMs = nowMs - refreshedMs;
  if (
    input.failed || !Number.isFinite(ageMs) || ageMs < 0 ||
    ageMs > input.refreshIntervalSeconds * 1_000 + 30_000
  ) return "stale";
  return input.itemCount > 0 ? "fresh" : "empty";
}

/** Changing the source roster must start a complete recent-search window. */
export function xFeedSourceAccountsChanged(previous: unknown, requested?: readonly string[]): boolean {
  if (!requested) return false;
  const normalize = (values: readonly unknown[]) => [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))].sort();
  return JSON.stringify(normalize(Array.isArray(previous) ? previous : [])) !== JSON.stringify(normalize(requested));
}

export function xFeedSnapshotAgeHours(
  refreshedAt: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!refreshedAt) return null;
  const refreshedMs = Date.parse(refreshedAt);
  if (!Number.isFinite(refreshedMs) || !Number.isFinite(nowMs)) return null;
  const ageMs = nowMs - refreshedMs;
  return ageMs >= 0 ? ageMs / HOUR_MS : null;
}

export function xFeedSnapshotWithinAge(
  refreshedAt: string | null | undefined,
  maxAgeHours: number,
  nowMs = Date.now(),
): boolean {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) return false;
  const ageHours = xFeedSnapshotAgeHours(refreshedAt, nowMs);
  return ageHours !== null && ageHours <= maxAgeHours;
}
