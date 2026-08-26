import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("scripts/migrations/024_face_presence.sql");
const store = read("lib/face-recognition-store.ts");

test("migration is registered after programming and keeps biometric vectors out of the web database", () => {
  const runner = read("scripts/apply-web-migrations.mjs");
  assert.ok(runner.indexOf('"024_face_presence.sql"') > runner.indexOf('"023_watch_programming.sql"'));
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS face_embeddings|embedding real\[\]/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS face_template_sets/);
  assert.match(migration, /template_fingerprint text NOT NULL/);
  assert.match(migration, /model_name text NOT NULL CHECK \(model_name = 'opencv_sface'\)/);
});

test("revocation, independent enrollment review, source scope, and audit retention fail closed", () => {
  assert.match(migration, /face_apply_consent_revocation/);
  assert.match(migration, /localTemplatePurgeQueued/);
  assert.match(migration, /reviewed_by IS NULL OR reviewed_by <> created_by/);
  assert.match(migration, /NEW\.reviewed_by = consent_recorder/);
  assert.match(migration, /sources\.content_id = ANY\(consents\.approved_content_ids\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON face_audit_log/);
  assert.match(migration, /purge_face_audit_retention/);
});

test("protected locator references use a PostgreSQL-safe explicit length bound", () => {
  assert.match(migration, /length\(ingest_locator_ref\) <= 500/);
  assert.match(migration, /\[A-Za-z0-9\._\/-\]\*\$/);
  assert.doesNotMatch(migration, /\{0,499\}/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS face_sources_ingest_locator_ref_check/);
  assert.match(migration, /ADD CONSTRAINT face_sources_ingest_locator_ref_check CHECK/);
});

test("archive intervals and public live/archive branches cannot bleed into one another", () => {
  assert.match(store, /Archive tracks require a finite endMs/);
  assert.match(store, /source_kind='archive' AND start_ms <= \$2 AND end_ms > \$2/);
  assert.match(store, /SELECT DISTINCT ON \(identity_id\)/);
  assert.match(store, /source_kind='live' AND live_active AND end_ms IS NULL/);
  assert.match(store, /FACE_LIVE_FRESHNESS_SECONDS/);
});

test("public and upload gates, cron credential, retention, and private preview protections are wired", () => {
  assert.match(read("app/api/watch/presence/route.ts"), /facePresencePublicIsEnabled/);
  assert.match(read("app/api/admin/faces/identities/[id]/references/route.ts"), /faceReferenceUploadsAreEnabled/);
  assert.match(read("app/api/admin/faces/maintenance/route.ts"), /timingSafeEqual/);
  assert.match(read("app/api/admin/faces/maintenance/route.ts"), /x-face-retention-secret/);
  assert.match(store, /interval '7 days'/);
  assert.match(store, /interval '30 days'/);
  const preview = read("app/api/admin/faces/identities/[id]/references/[referenceId]/image/route.ts");
  assert.match(preview, /requireAdmin/);
  assert.match(preview, /private, no-store/);
  assert.match(preview, /Cross-Origin-Resource-Policy/);
});

test("client cannot confirm physical deletion and public projection excludes private evidence", () => {
  const contracts = read("lib/face-recognition-contracts.ts");
  assert.doesNotMatch(contracts, /z\.literal\("confirm_deleted"\)/);
  assert.doesNotMatch(contracts, /z\.literal\("request_delete"\)/);
  const viewStart = migration.indexOf("CREATE OR REPLACE VIEW face_presence_public_safe");
  const viewEnd = migration.indexOf("COMMENT ON VIEW face_presence_public_safe", viewStart);
  const view = migration.slice(viewStart, viewEnd);
  assert.doesNotMatch(view, /embedding|similarity_score|evidence_key|ingest_locator_ref/);
});

test("worker writes use narrow security-definer RPCs and cancellation purges private proposals", () => {
  for (const signature of [
    /CREATE OR REPLACE FUNCTION claim_face_archive_job/,
    /CREATE OR REPLACE FUNCTION heartbeat_face_job/,
    /CREATE OR REPLACE FUNCTION finish_face_job/,
    /CREATE OR REPLACE FUNCTION import_face_track_proposal/,
    /CREATE OR REPLACE FUNCTION sync_face_template_set/,
    /CREATE OR REPLACE FUNCTION attest_face_template_purged/,
    /CREATE OR REPLACE FUNCTION heartbeat_face_worker/,
  ]) assert.match(migration, signature);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION import_face_track_proposal/);
  assert.match(migration, /p_job_id uuid DEFAULT NULL,\s+p_allow_automatic boolean DEFAULT true/);
  assert.match(migration, /sources\.id AS source_id/);
  assert.match(migration, /jobs\.kind AS job_kind/);
  assert.match(migration, /face_worker_can_run_job\(jobs\.id, p_worker_id, p_allow_automatic\)/);
  assert.match(migration, /jobs\.kind = 'manual_review'/);
  assert.match(migration, /automatic_capable boolean NOT NULL DEFAULT false/);
  assert.match(migration, /NOT p_automatic_capable AND p_model_version IS NOT NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS automatic_capable/);
  assert.match(migration, /ALTER COLUMN model_version DROP NOT NULL/);
  assert.match(migration, /SET automatic_capable = \(model_version IS NOT NULL\)/);
  assert.match(migration, /face_jobs_cancelled_proposal_purge/);
  assert.match(migration, /DELETE FROM face_tracks\s+WHERE job_id = NEW\.id AND state IN \('proposed', 'unknown'\)/);
  assert.match(migration, /sets\.state = 'purged'\s+AND sets\.purged_at IS NOT NULL/);
});

test("active consent replacement is an explicit destructive action", () => {
  const route = read("app/api/admin/faces/identities/[id]/consent/route.ts");
  const controlRoom = read("components/admin/faces/FaceRecognitionControlRoom.tsx");
  assert.match(route, /replaceActiveConsent: z\.boolean\(\)\.default\(false\)/);
  assert.match(route, /replacement_confirmation_required/);
  assert.match(controlRoom, /Replace the active grant and require re-enrollment/);
  assert.match(controlRoom, /replaceActiveConsent: replacesActiveConsent && replacementConfirmed/);
  assert.match(store, /const previous = await currentConsent\(db, identityId, \{ forUpdate: true \}\)/);
  assert.match(store, /Date\.parse\(previous\.expires_at\) > Date\.now\(\)\s+&& !replaceActiveConsent/);
});

test("review approval and publication require an inspectable source moment", () => {
  const controlRoom = read("components/admin/faces/FaceRecognitionControlRoom.tsx");
  assert.ok((store.match(/if \(!reviewHref\(track\.content_id, Number\(track\.start_ms\)\)\)/g) ?? []).length >= 2);
  assert.match(store, /Approval is disabled until the exact source moment/);
  assert.match(store, /Publishing is disabled until the exact source moment/);
  assert.match(controlRoom, /Approval and publication are disabled until a protected review frame/);
});
