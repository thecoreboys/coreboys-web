/**
 * Server-only FanZone wall data helpers.
 *
 * The schema guard mirrors the existing OAuth/Instagram guards: deployment
 * still has a checked-in migration, while a newly started app process can
 * safely repair an older database before serving the feature.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

export async function ensureFanzoneSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fan_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        file_url text NOT NULL,
        thumb_url text,
        caption text,
        submitter_first_name text NOT NULL,
        submitter_last_name text NOT NULL,
        submitter_email text NOT NULL,
        member_slugs text[] NOT NULL DEFAULT '{}',
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','approved','denied')),
        denial_reason text,
        approved_at timestamptz,
        reviewed_by_email text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      ALTER TABLE fan_submissions
        ADD COLUMN IF NOT EXISTS user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS storage_key text,
        ADD COLUMN IF NOT EXISTS thumb_storage_key text,
        ADD COLUMN IF NOT EXISTS mime text,
        ADD COLUMN IF NOT EXISTS size_bytes integer,
        ADD COLUMN IF NOT EXISTS width integer,
        ADD COLUMN IF NOT EXISTS height integer,
        ADD COLUMN IF NOT EXISTS submission_kind text NOT NULL DEFAULT 'photo',
        ADD COLUMN IF NOT EXISTS event_name text,
        ADD COLUMN IF NOT EXISTS happened_on date,
        ADD COLUMN IF NOT EXISTS location_label text,
        ADD COLUMN IF NOT EXISTS photographer_credit text,
        ADD COLUMN IF NOT EXISTS story text,
        ADD COLUMN IF NOT EXISTS image_sha256 text,
        ADD COLUMN IF NOT EXISTS receipt_token_hash text,
        ADD COLUMN IF NOT EXISTS consent_version text,
        ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'unreviewed',
        ADD COLUMN IF NOT EXISTS moderation_notes text,
        ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
        ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS featured_at timestamptz
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_submissions_status_idx
        ON fan_submissions (status, created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_submissions_user_idx
        ON fan_submissions (user_id, created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_submissions_hash_idx
        ON fan_submissions (image_sha256)
        WHERE image_sha256 IS NOT NULL
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_photo_reactions (
        submission_id uuid NOT NULL REFERENCES fan_submissions(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        reaction text NOT NULL DEFAULT 'core' CHECK (reaction IN ('core')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (submission_id, user_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_photo_reports (
        id bigserial PRIMARY KEY,
        submission_id uuid NOT NULL REFERENCES fan_submissions(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        reason text NOT NULL,
        details text,
        status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        resolved_by text,
        UNIQUE (submission_id, user_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_submission_audit (
        id bigserial PRIMARY KEY,
        submission_id uuid NOT NULL,
        actor_email text NOT NULL,
        action text NOT NULL,
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_submission_audit_submission_idx
        ON fan_submission_audit (submission_id, created_at DESC)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_notification_outbox (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        dedupe_key text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','processing','sent','failed','cancelled')),
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        UNIQUE (event_type, dedupe_key)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_notification_outbox_pending_idx
        ON fan_notification_outbox (status, available_at, created_at)
        WHERE status IN ('pending','failed','processing')
    `);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export type FanPhotoKind = "photo" | "art";
export type FanPhotoStatus = "pending" | "approved" | "denied";

export type PublicFanPhoto = {
  id: string;
  imageUrl: string;
  thumbUrl: string;
  caption: string | null;
  story: string | null;
  kind: FanPhotoKind;
  memberSlugs: string[];
  eventName: string | null;
  happenedOn: string | null;
  locationLabel: string | null;
  photographerCredit: string | null;
  submittedBy: string;
  createdAt: string;
  featured: boolean;
  reactions: number;
  reacted: boolean;
};

type PublicPhotoRow = {
  id: string;
  caption: string | null;
  story: string | null;
  submission_kind: string;
  member_slugs: string[];
  event_name: string | null;
  happened_on: string | null;
  location_label: string | null;
  photographer_credit: string | null;
  submitter_first_name: string;
  submitter_last_name: string;
  created_at: string;
  featured: boolean;
  reactions: string;
  reacted: boolean;
};

export type FanPhotoFilters = {
  kind?: FanPhotoKind | null;
  member?: string | null;
  event?: string | null;
  sort?: "featured" | "newest" | "loved";
  limit?: number;
};

export async function listApprovedFanPhotos(
  userId: string | null,
  filters: FanPhotoFilters = {},
): Promise<PublicFanPhoto[]> {
  await ensureFanzoneSchema();
  const order =
    filters.sort === "loved"
      ? "reactions DESC, fs.created_at DESC"
      : filters.sort === "newest"
        ? "fs.created_at DESC"
        : "fs.featured DESC, fs.featured_at DESC NULLS LAST, fs.created_at DESC";
  const limit = Math.min(120, Math.max(1, filters.limit ?? 72));
  const result = await query<PublicPhotoRow>(
    `SELECT fs.id::text, fs.caption, fs.story, fs.submission_kind,
            fs.member_slugs, fs.event_name, fs.happened_on::text,
            fs.location_label, fs.photographer_credit,
            fs.submitter_first_name, fs.submitter_last_name,
            fs.created_at::text, fs.featured,
            COUNT(fr.user_id)::text AS reactions,
            COALESCE(BOOL_OR(fr.user_id = $1), false) AS reacted
       FROM fan_submissions fs
       LEFT JOIN fan_photo_reactions fr ON fr.submission_id = fs.id
      WHERE fs.status = 'approved'
        AND ($2::text IS NULL OR fs.submission_kind = $2)
        AND ($3::text IS NULL OR $3 = ANY(fs.member_slugs))
        AND ($4::text IS NULL OR fs.event_name = $4)
      GROUP BY fs.id
      ORDER BY ${order}
      LIMIT $5`,
    [userId, filters.kind ?? null, filters.member ?? null, filters.event ?? null, limit],
  );
  return result.rows.map(toPublicPhoto);
}

export async function getApprovedFanPhoto(
  id: string,
  userId: string | null,
): Promise<PublicFanPhoto | null> {
  await ensureFanzoneSchema();
  const result = await query<PublicPhotoRow>(
    `SELECT fs.id::text, fs.caption, fs.story, fs.submission_kind,
            fs.member_slugs, fs.event_name, fs.happened_on::text,
            fs.location_label, fs.photographer_credit,
            fs.submitter_first_name, fs.submitter_last_name,
            fs.created_at::text, fs.featured,
            COUNT(fr.user_id)::text AS reactions,
            COALESCE(BOOL_OR(fr.user_id = $2), false) AS reacted
       FROM fan_submissions fs
       LEFT JOIN fan_photo_reactions fr ON fr.submission_id = fs.id
      WHERE fs.id = $1 AND fs.status = 'approved'
      GROUP BY fs.id`,
    [id, userId],
  );
  return result.rows[0] ? toPublicPhoto(result.rows[0]) : null;
}

function toPublicPhoto(row: PublicPhotoRow): PublicFanPhoto {
  const first = row.submitter_first_name.trim() || "Community member";
  const last = row.submitter_last_name.trim();
  return {
    id: row.id,
    imageUrl: `/api/fanzone/photos/${row.id}/image`,
    thumbUrl: `/api/fanzone/photos/${row.id}/image?size=thumb`,
    caption: row.caption,
    story: row.story,
    kind: row.submission_kind === "art" ? "art" : "photo",
    memberSlugs: row.member_slugs ?? [],
    eventName: row.event_name,
    happenedOn: row.happened_on,
    locationLabel: row.location_label,
    photographerCredit: row.photographer_credit,
    submittedBy: last ? `${first} ${last.slice(0, 1).toUpperCase()}.` : first,
    createdAt: row.created_at,
    featured: row.featured,
    reactions: Number(row.reactions),
    reacted: row.reacted,
  };
}

export function hashReceiptToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function receiptTokenMatches(token: string, expectedHash: string | null): boolean {
  if (!expectedHash) return false;
  const actual = Buffer.from(hashReceiptToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
