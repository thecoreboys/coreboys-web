import "server-only";

import { query } from "@/lib/db";

const WINDOW_SECONDS = 15 * 60;
let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = query(`
    CREATE TABLE IF NOT EXISTS site_access_rate_limits (
      subject_key text PRIMARY KEY,
      bucket_started_at timestamptz NOT NULL DEFAULT now(),
      hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0)
    )
  `).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function consumeSiteAccessRateLimit(
  subjectKey: string,
  maxAttempts = 6,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  await ensureSchema();
  const result = await query<{ hits: string; bucket_started_at: string }>(
    `INSERT INTO site_access_rate_limits (subject_key, bucket_started_at, hits)
     VALUES ($1, now(), 1)
     ON CONFLICT (subject_key) DO UPDATE
       SET hits = CASE
             WHEN site_access_rate_limits.bucket_started_at <= now() - ($2::int * interval '1 second') THEN 1
             ELSE site_access_rate_limits.hits + 1
           END,
           bucket_started_at = CASE
             WHEN site_access_rate_limits.bucket_started_at <= now() - ($2::int * interval '1 second') THEN now()
             ELSE site_access_rate_limits.bucket_started_at
           END
     RETURNING hits::text, bucket_started_at::text`,
    [subjectKey, WINDOW_SECONDS],
  );
  const row = result.rows[0];
  const hits = Number(row?.hits ?? maxAttempts + 1);
  if (hits <= maxAttempts) return { ok: true, retryAfterSeconds: 0 };
  const startedAt = Date.parse(row?.bucket_started_at ?? "");
  const elapsed = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 1_000 : 0;
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(WINDOW_SECONDS - elapsed)) };
}

export async function clearSiteAccessRateLimit(subjectKey: string): Promise<void> {
  await ensureSchema();
  await query(`DELETE FROM site_access_rate_limits WHERE subject_key = $1`, [subjectKey]);
}
