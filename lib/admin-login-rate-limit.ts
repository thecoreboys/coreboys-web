import "server-only";

import { query } from "@/lib/db";

type LimitResult = { ok: boolean; retryAfterSeconds: number };

const WINDOW_SECONDS = 15 * 60;

/**
 * Database-backed fixed-window login throttle. Unlike a process-local Map it
 * holds when the app restarts or traffic lands on another instance.
 */
export async function consumeAdminLoginRateLimit(
  subjectKey: string,
  maxAttempts: number,
): Promise<LimitResult> {
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
    [subjectKey, WINDOW_SECONDS],
  );
  const row = result.rows[0];
  const hits = Number(row?.hits ?? maxAttempts + 1);
  if (hits <= maxAttempts) return { ok: true, retryAfterSeconds: 0 };
  const startedAt = Date.parse(row?.bucket_started_at ?? "");
  const elapsed = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 1_000 : 0;
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil(WINDOW_SECONDS - elapsed)),
  };
}
