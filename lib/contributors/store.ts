import "server-only";
import { query, withTransaction } from "@/lib/db";
import { contributorSchema, type ContributorDetails } from "./validation";
import { decryptApplication, encryptApplication } from "./security";

let ready: Promise<void> | null = null;
export function ensureContributorSchema(): Promise<void> {
  return ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS contributor_applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_id uuid NOT NULL UNIQUE,
      details_encrypted text NOT NULL, ip_fingerprint text NOT NULL,
      age_confirmed boolean NOT NULL CHECK (age_confirmed = true),
      created_at timestamptz NOT NULL DEFAULT now())`);
    await query(`CREATE INDEX IF NOT EXISTS contributor_applications_created_idx ON contributor_applications(created_at DESC, id DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS contributor_applications_ip_idx ON contributor_applications(ip_fingerprint, created_at DESC)`);
  })().catch(error => { ready = null; throw error; });
}
export async function saveApplication(details: ContributorDetails, fingerprint: string, tokenId: string): Promise<"saved" | "limited" | "duplicate"> {
  await ensureContributorSchema(); const encrypted = encryptApplication(details);
  return withTransaction(async db => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`contributor:${fingerprint}`]);
    const duplicate = await db.query(`SELECT id FROM contributor_applications WHERE token_id=$1`, [tokenId]);
    if (duplicate.rows.length) return "duplicate";
    const count = await db.query(`SELECT count(*)::int AS count FROM contributor_applications WHERE ip_fingerprint=$1 AND created_at > now() - interval '24 hours'`, [fingerprint]);
    if (Number(count.rows[0].count) >= 5) return "limited";
    await db.query(`INSERT INTO contributor_applications(token_id,details_encrypted,ip_fingerprint,age_confirmed) VALUES($1,$2,$3,true)`, [tokenId, encrypted, fingerprint]);
    return "saved";
  });
}
export type ApplicationCursor = { at: string; id: string };
export async function listApplications(cursor: ApplicationCursor | null) {
  await ensureContributorSchema();
  const result = await query<{id: string; created_at: string; details_encrypted: string}>(`SELECT id::text,created_at::text,details_encrypted FROM contributor_applications
    WHERE ($1::timestamptz IS NULL OR (created_at,id) < ($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT 26`, [cursor?.at ?? null, cursor?.id ?? null]);
  const rows = result.rows.slice(0,25);
  const last = rows.at(-1);
  return { applications: rows.map(row => ({ id: row.id, submittedAt: row.created_at, ...contributorSchema.parse(decryptApplication(row.details_encrypted)) })), nextCursor: result.rows.length > 25 && last ? { at: last.created_at, id: last.id } : null };
}
