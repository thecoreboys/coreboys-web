import "server-only";
import { query, withTransaction } from "@/lib/db";
import { normalizeSubmission, type SubmissionDetails, type SubmissionFilters, type SubmissionCounts, type InboxSubmission } from "./validation";
import { decryptApplication, encryptApplication } from "./security";

let ready: Promise<void> | null = null;
export function ensureContributorSchema(): Promise<void> {
  return ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS contributor_applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_id uuid NOT NULL UNIQUE,
      details_encrypted text NOT NULL, ip_fingerprint text NOT NULL,
      age_confirmed boolean NOT NULL CHECK (age_confirmed = true),
      created_at timestamptz NOT NULL DEFAULT now())`);
    await query(`ALTER TABLE contributor_applications
      ADD COLUMN IF NOT EXISTS submission_type text NOT NULL DEFAULT 'help' CHECK (submission_type IN ('help', 'suggestion')),
      ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'reviewed'))`);
    await query(`DO $$ BEGIN
      ALTER TABLE contributor_applications DROP CONSTRAINT IF EXISTS contributor_applications_age_confirmed_check;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contributor_applications_help_age_check' AND conrelid='contributor_applications'::regclass) THEN
        ALTER TABLE contributor_applications ADD CONSTRAINT contributor_applications_help_age_check CHECK (submission_type='suggestion' OR age_confirmed=true);
      END IF;
    END $$`);
    await query(`CREATE INDEX IF NOT EXISTS contributor_applications_created_idx ON contributor_applications(created_at DESC, id DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS contributor_applications_ip_idx ON contributor_applications(ip_fingerprint, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS contributor_applications_inbox_idx ON contributor_applications(submission_type, review_status, created_at DESC, id DESC)`);
  })().catch(error => { ready = null; throw error; });
}
export async function saveApplication(details: SubmissionDetails, fingerprint: string, tokenId: string): Promise<"saved" | "limited" | "duplicate"> {
  await ensureContributorSchema(); const encrypted = encryptApplication(details);
  return withTransaction(async db => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`contributor:${fingerprint}`]);
    const duplicate = await db.query(`SELECT id FROM contributor_applications WHERE token_id=$1`, [tokenId]);
    if (duplicate.rows.length) return "duplicate";
    const count = await db.query(`SELECT count(*)::int AS count FROM contributor_applications WHERE ip_fingerprint=$1 AND created_at > now() - interval '24 hours'`, [fingerprint]);
    if (Number(count.rows[0].count) >= 5) return "limited";
    await db.query(`INSERT INTO contributor_applications(token_id,details_encrypted,ip_fingerprint,age_confirmed,submission_type) VALUES($1,$2,$3,$4,$5)`, [tokenId, encrypted, fingerprint, details.ageConfirmed, "kind" in details ? details.kind : "help"]);
    return "saved";
  });
}
export type ApplicationCursor = { at: string; id: string };
export async function listApplications(cursor: ApplicationCursor | null, filters: SubmissionFilters = { kind: "all", status: "all" }) {
  await ensureContributorSchema();
  const [result, totals] = await Promise.all([
    query<{id: string; created_at: string; details_encrypted: string; review_status: InboxSubmission["status"]}>(`SELECT id::text,created_at::text,details_encrypted,review_status FROM contributor_applications
      WHERE ($1::timestamptz IS NULL OR (created_at,id) < ($1::timestamptz,$2::uuid))
        AND ($3::text IS NULL OR submission_type=$3) AND ($4::text IS NULL OR review_status=$4)
      ORDER BY created_at DESC,id DESC LIMIT 26`, [cursor?.at ?? null, cursor?.id ?? null, filters.kind === "all" ? null : filters.kind, filters.status === "all" ? null : filters.status]),
    query<SubmissionCounts>(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE submission_type='help')::int AS help,
      count(*) FILTER (WHERE submission_type='suggestion')::int AS suggestion,
      count(*) FILTER (WHERE review_status='new')::int AS new FROM contributor_applications`),
  ]);
  const rows = result.rows.slice(0,25);
  const last = rows.at(-1);
  return {
    applications: rows.map(row => ({ id: row.id, submittedAt: row.created_at, status: row.review_status, ...normalizeSubmission(decryptApplication(row.details_encrypted)) })),
    nextCursor: result.rows.length > 25 && last ? { at: last.created_at, id: last.id } : null,
    counts: totals.rows[0] ?? { total: 0, help: 0, suggestion: 0, new: 0 },
  };
}

export async function updateApplicationStatus(id: string, status: InboxSubmission["status"]): Promise<boolean> {
  await ensureContributorSchema();
  const result = await query(`UPDATE contributor_applications SET review_status=$2 WHERE id=$1::uuid RETURNING id`, [id, status]);
  return result.rows.length > 0;
}
