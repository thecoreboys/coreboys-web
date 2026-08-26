const HOUR_MS = 60 * 60_000;

/** Production render paths fail closed when the scheduled snapshot is a day old. */
export const X_FEED_PUBLIC_MAX_AGE_HOURS = 24;

/**
 * Local QA has no hourly scheduler, so it may render the last protected
 * snapshot for one week. This does not permit an upstream request and is never
 * used in production.
 */
export const X_FEED_LOCAL_QA_MAX_AGE_HOURS = 7 * 24;

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
