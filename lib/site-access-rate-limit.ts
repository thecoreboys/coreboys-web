import "server-only";

import { query } from "@/lib/db";

const WINDOW_SECONDS = 15 * 60;
const SUBJECT_PREFIX = "site-preview:";
const MAX_FALLBACK_BUCKETS = 2_048;

type FallbackBucket = { hits: number; startedAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __siteAccessFallbackBuckets: Map<string, FallbackBucket> | undefined;
}

function fallbackBuckets(): Map<string, FallbackBucket> {
  global.__siteAccessFallbackBuckets ??= new Map();
  return global.__siteAccessFallbackBuckets;
}

function consumeFallback(
  subjectKey: string,
  maxAttempts: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMilliseconds = WINDOW_SECONDS * 1_000;
  const buckets = fallbackBuckets();
  if (buckets.size >= MAX_FALLBACK_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt >= windowMilliseconds) buckets.delete(key);
    }
    if (buckets.size >= MAX_FALLBACK_BUCKETS) {
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (oldestKey) buckets.delete(oldestKey);
    }
  }
  const existing = buckets.get(subjectKey);
  const bucket = !existing || now - existing.startedAt >= windowMilliseconds
    ? { hits: 1, startedAt: now }
    : { hits: existing.hits + 1, startedAt: existing.startedAt };
  buckets.set(subjectKey, bucket);
  if (bucket.hits <= maxAttempts) return { ok: true, retryAfterSeconds: 0 };
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowMilliseconds - (now - bucket.startedAt)) / 1_000)),
  };
}

export async function consumeSiteAccessRateLimit(
  subjectKey: string,
  maxAttempts = 6,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const storedSubjectKey = `${SUBJECT_PREFIX}${subjectKey}`;
  try {
    const result = await query<{ hits: string; bucket_started_at: string }>(
      `INSERT INTO admin_auth_rate_limits (subject_key, bucket_started_at, hits)
       VALUES ($1, now(), 1)
       ON CONFLICT (subject_key) DO UPDATE
         SET hits = CASE
               WHEN admin_auth_rate_limits.bucket_started_at <= now() - ($2::int * interval '1 second') THEN 1
               ELSE admin_auth_rate_limits.hits + 1
             END,
             bucket_started_at = CASE
               WHEN admin_auth_rate_limits.bucket_started_at <= now() - ($2::int * interval '1 second') THEN now()
               ELSE admin_auth_rate_limits.bucket_started_at
             END
       RETURNING hits::text, bucket_started_at::text`,
      [storedSubjectKey, WINDOW_SECONDS],
    );
    const row = result.rows[0];
    const hits = Number(row?.hits ?? maxAttempts + 1);
    if (hits <= maxAttempts) return { ok: true, retryAfterSeconds: 0 };
    const startedAt = Date.parse(row?.bucket_started_at ?? "");
    const elapsed = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 1_000 : 0;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(WINDOW_SECONDS - elapsed)) };
  } catch (error) {
    console.error("site_access_database_throttle_unavailable", error);
    return consumeFallback(storedSubjectKey, maxAttempts);
  }
}

export async function clearSiteAccessRateLimit(subjectKey: string): Promise<void> {
  const storedSubjectKey = `${SUBJECT_PREFIX}${subjectKey}`;
  fallbackBuckets().delete(storedSubjectKey);
  try {
    await query(`DELETE FROM admin_auth_rate_limits WHERE subject_key = $1`, [storedSubjectKey]);
  } catch (error) {
    console.error("site_access_database_throttle_clear_unavailable", error);
  }
}
