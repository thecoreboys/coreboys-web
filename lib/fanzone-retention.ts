import { query } from "@/lib/db";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import { deletePrivateFanPhoto } from "@/lib/fanzone-storage";

export type FanZoneRetentionResult = {
  expiredPending: number;
  storageRowsCleaned: number;
  storageDeletesFailed: number;
  anonymized: number;
};

/**
 * Idempotent FanZone lifecycle cleanup:
 * - unreviewed uploads expire after 45 days;
 * - denied image objects are removed after 30 days;
 * - denied submitter details are anonymized after 90 days.
 */
export async function runFanZoneRetention(): Promise<FanZoneRetentionResult> {
  await ensureFanzoneSchema();
  const expired = await query<{ count: string }>(
    `WITH changed AS (
       UPDATE fan_submissions
          SET status = 'denied',
              denial_reason = 'The review window expired before publication.',
              reviewed_at = now(),
              reviewed_by_email = 'system:retention',
              updated_at = now()
        WHERE status = 'pending'
          AND created_at < now() - interval '45 days'
        RETURNING id
     ), audited AS (
       INSERT INTO fan_submission_audit (submission_id, actor_email, action, details)
       SELECT id, 'system:retention', 'status:denied', '{"reason":"review_window_expired"}'::jsonb
         FROM changed
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM audited`,
  );

  const stored = await query<{
    id: string;
    storage_key: string | null;
    thumb_storage_key: string | null;
  }>(
    `SELECT id::text, storage_key, thumb_storage_key
      FROM fan_submissions
      WHERE status = 'denied'
        AND COALESCE(reviewed_at, created_at) < now() - interval '30 days'
        AND (storage_key IS NOT NULL OR thumb_storage_key IS NOT NULL)
      ORDER BY created_at ASC
      LIMIT 250`,
  );
  let storageRowsCleaned = 0;
  let storageDeletesFailed = 0;
  for (const row of stored.rows) {
    const [original, thumb] = await Promise.allSettled([
      deletePrivateFanPhoto(row.storage_key),
      deletePrivateFanPhoto(row.thumb_storage_key),
    ]);
    const nextOriginal = original.status === "fulfilled" ? null : row.storage_key;
    const nextThumb = thumb.status === "fulfilled" ? null : row.thumb_storage_key;
    storageDeletesFailed += Number(original.status === "rejected") + Number(thumb.status === "rejected");
    const updated = await query(
      `UPDATE fan_submissions
          SET storage_key = $2,
              thumb_storage_key = $3,
              file_url = CASE WHEN $2::text IS NULL THEN '/removed' ELSE file_url END,
              thumb_url = CASE WHEN $3::text IS NULL THEN NULL ELSE thumb_url END,
              mime = CASE WHEN $2::text IS NULL THEN NULL ELSE mime END,
              size_bytes = CASE WHEN $2::text IS NULL THEN NULL ELSE size_bytes END,
              width = CASE WHEN $2::text IS NULL THEN NULL ELSE width END,
              height = CASE WHEN $2::text IS NULL THEN NULL ELSE height END,
              image_sha256 = CASE WHEN $2::text IS NULL THEN NULL ELSE image_sha256 END,
              updated_at = now()
        WHERE id = $1
          AND status = 'denied'
          AND (storage_key IS NOT NULL OR thumb_storage_key IS NOT NULL)`,
      [row.id, nextOriginal, nextThumb],
    );
    if ((updated.rowCount ?? 0) > 0 && nextOriginal === null && nextThumb === null) {
      storageRowsCleaned += 1;
    }
  }

  const anonymized = await query<{ count: string }>(
    `WITH changed AS (
       UPDATE fan_submissions
          SET user_id = NULL,
              submitter_first_name = 'Former',
              submitter_last_name = 'fan',
              submitter_email = 'removed@invalid.local',
              caption = NULL,
              story = NULL,
              event_name = NULL,
              happened_on = NULL,
              location_label = NULL,
              photographer_credit = NULL,
              receipt_token_hash = NULL,
              consent_version = NULL,
              moderation_notes = NULL,
              updated_at = now()
        WHERE status = 'denied'
          AND COALESCE(reviewed_at, created_at) < now() - interval '90 days'
          AND (
            user_id IS NOT NULL
            OR submitter_email <> 'removed@invalid.local'
            OR receipt_token_hash IS NOT NULL
          )
        RETURNING id
     ), audited AS (
       INSERT INTO fan_submission_audit (submission_id, actor_email, action)
       SELECT id, 'system:retention', 'personal_data:anonymized' FROM changed
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM audited`,
  );

  return {
    expiredPending: Number(expired.rows[0]?.count ?? 0),
    storageRowsCleaned,
    storageDeletesFailed,
    anonymized: Number(anonymized.rows[0]?.count ?? 0),
  };
}
