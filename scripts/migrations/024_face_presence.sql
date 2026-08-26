-- Consent-first, closed-set face presence metadata.
--
-- Actual biometric templates remain only in the protected local worker. The
-- web DB stores non-vector synchronization metadata and short-lived private
-- evidence metadata. The only public projection is face_presence_public_safe,
-- which deliberately excludes templates, similarity, evidence and locators.
-- Automatic matching and automatic publishing are both opt-in and default off.

CREATE TABLE IF NOT EXISTS face_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_kind text NOT NULL CHECK (canonical_kind IN ('member', 'crew')),
  canonical_slug text NOT NULL CHECK (
    canonical_slug = lower(canonical_slug)
    AND canonical_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  ),
  display_name text NOT NULL CHECK (length(BTRIM(display_name)) BETWEEN 1 AND 120),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'active', 'archived', 'revoked')),
  created_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  revocation_reason text CHECK (
    revocation_reason IS NULL OR length(BTRIM(revocation_reason)) BETWEEN 3 AND 500
  ),
  UNIQUE (canonical_kind, canonical_slug),
  UNIQUE (id, canonical_kind, canonical_slug),
  CHECK (
    (state = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
    OR (state <> 'revoked' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS face_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES face_identities(id) ON DELETE RESTRICT,
  consent_version text NOT NULL CHECK (length(BTRIM(consent_version)) BETWEEN 1 AND 80),
  capture_method text NOT NULL
    CHECK (capture_method IN ('signed_release', 'subject_portal')),
  evidence_ref text NOT NULL CHECK (length(BTRIM(evidence_ref)) BETWEEN 3 AND 500),
  consent_text_sha256 text NOT NULL CHECK (consent_text_sha256 ~ '^[a-f0-9]{64}$'),
  subject_confirmed_adult boolean NOT NULL CHECK (subject_confirmed_adult),
  adult_verified_at timestamptz NOT NULL,
  allow_template_creation boolean NOT NULL DEFAULT false,
  allow_live_matching boolean NOT NULL DEFAULT false,
  allow_archive_matching boolean NOT NULL DEFAULT false,
  allow_public_tag boolean NOT NULL DEFAULT false,
  allow_profile_links boolean NOT NULL DEFAULT false,
  approved_content_ids text[] NOT NULL DEFAULT '{}'::text[],
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  granted_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  revocation_reason text CHECK (
    revocation_reason IS NULL OR length(BTRIM(revocation_reason)) BETWEEN 3 AND 500
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, identity_id),
  CHECK (expires_at > granted_at),
  CHECK (adult_verified_at <= granted_at + interval '5 minutes'),
  CHECK (adult_verified_at >= granted_at - interval '30 days'),
  CHECK (expires_at > adult_verified_at),
  CHECK (
    allow_template_creation OR allow_live_matching OR allow_archive_matching
    OR allow_public_tag OR allow_profile_links
  ),
  CHECK (NOT (allow_live_matching OR allow_archive_matching) OR allow_template_creation),
  -- The reviewed v1 launch is archive/VOD-only. Live columns remain reserved
  -- for a future migration that can bind consent to a predeclared session.
  CHECK (allow_live_matching = false),
  CHECK (NOT allow_public_tag OR allow_profile_links),
  CHECK (cardinality(approved_content_ids) <= 100),
  CHECK (array_position(approved_content_ids, '') IS NULL),
  CHECK (NOT ('*' = ANY(approved_content_ids))),
  CHECK (POSITION('://' IN array_to_string(approved_content_ids, ',')) = 0),
  CHECK (array_to_string(approved_content_ids, ',') !~ '[[:space:]]'),
  CHECK (length(array_to_string(approved_content_ids, E'\n')) <= 30000),
  CHECK (
    NOT (allow_live_matching OR allow_archive_matching OR allow_public_tag)
    OR cardinality(approved_content_ids) > 0
  ),
  CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS face_consents_one_current_grant_idx
  ON face_consents (identity_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS face_consents_expiry_idx
  ON face_consents (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS face_consent_archive_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  content_id text NOT NULL CHECK (
    length(BTRIM(content_id)) BETWEEN 1 AND 300
    AND content_id = BTRIM(content_id)
    AND content_id <> '*'
    AND POSITION('://' IN content_id) = 0
    AND content_id !~ '[[:space:]]'
  ),
  start_ms bigint NOT NULL CHECK (start_ms >= 0),
  end_ms bigint NOT NULL CHECK (end_ms > start_ms),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (consent_id, identity_id)
    REFERENCES face_consents(id, identity_id) ON DELETE RESTRICT,
  UNIQUE (consent_id, content_id, start_ms, end_ms)
);
CREATE INDEX IF NOT EXISTS face_consent_archive_scope_lookup_idx
  ON face_consent_archive_scopes (consent_id, content_id, start_ms, end_ms);

CREATE TABLE IF NOT EXISTS face_reference_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL,
  consent_id uuid NOT NULL,
  storage_key text CHECK (storage_key IS NULL OR length(BTRIM(storage_key)) BETWEEN 3 AND 1000),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  file_name text NOT NULL CHECK (length(BTRIM(file_name)) BETWEEN 1 AND 240),
  source_kind text NOT NULL
    CHECK (source_kind IN ('subject_provided', 'creator_session', 'licensed_archive')),
  subject_approved boolean NOT NULL CHECK (subject_approved),
  notes text CHECK (notes IS NULL OR length(BTRIM(notes)) <= 1000),
  quality_issues text[] NOT NULL DEFAULT '{}'::text[],
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 15728640),
  width integer NOT NULL CHECK (width BETWEEN 64 AND 12000),
  height integer NOT NULL CHECK (height BETWEEN 64 AND 12000),
  captured_at timestamptz,
  state text NOT NULL DEFAULT 'pending_review'
    CHECK (state IN ('pending_review', 'approved', 'rejected', 'deletion_pending', 'deleted')),
  retention_expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(BTRIM(review_note)) <= 500),
  revoked_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (consent_id, identity_id)
    REFERENCES face_consents(id, identity_id) ON DELETE RESTRICT,
  UNIQUE (identity_id, content_sha256),
  UNIQUE (storage_key),
  CHECK (retention_expires_at > created_at),
  CHECK (
    (state = 'deleted' AND storage_key IS NULL AND deleted_at IS NOT NULL)
    OR (state <> 'deleted' AND storage_key IS NOT NULL AND deleted_at IS NULL)
  ),
  CHECK (
    (reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  ),
  -- Enrollment approval is a second-person action. The approver must also be
  -- different from the subject-consent recorder (enforced by the trigger
  -- below because that actor lives on face_consents).
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)
);
CREATE INDEX IF NOT EXISTS face_reference_assets_active_idx
  ON face_reference_assets (identity_id, created_at DESC)
  WHERE state IN ('pending_review', 'approved') AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS face_reference_assets_deletion_idx
  ON face_reference_assets (deletion_requested_at)
  WHERE state = 'deletion_pending';

-- Non-biometric synchronization metadata for templates that live only inside
-- the protected local worker. Fingerprints are per-enrollment HMAC digests;
-- vectors, detector crops, template salts and similarity data never enter the
-- web database.
CREATE TABLE IF NOT EXISTS face_template_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL,
  consent_id uuid NOT NULL,
  model_name text NOT NULL CHECK (model_name = 'opencv_sface'),
  model_version text NOT NULL CHECK (model_version ~ '^[a-f0-9]{64}$'),
  template_fingerprint text NOT NULL CHECK (template_fingerprint ~ '^[a-f0-9]{64}$'),
  template_count integer NOT NULL CHECK (template_count BETWEEN 3 AND 20),
  reference_hashes text[] NOT NULL,
  worker_id text NOT NULL CHECK (length(BTRIM(worker_id)) BETWEEN 1 AND 160),
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'purge_pending', 'purged', 'failed')),
  synced_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  purged_at timestamptz,
  error_message text CHECK (error_message IS NULL OR length(BTRIM(error_message)) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (consent_id, identity_id)
    REFERENCES face_consents(id, identity_id) ON DELETE RESTRICT,
  UNIQUE (identity_id, consent_id, model_name, model_version),
  CHECK (cardinality(reference_hashes) BETWEEN 3 AND 20),
  CHECK (template_count = cardinality(reference_hashes)),
  CHECK (array_position(reference_hashes, '') IS NULL),
  CHECK (array_to_string(reference_hashes, E'\n') ~ '^([a-f0-9]{64})(\n[a-f0-9]{64})*$'),
  CHECK (expires_at > created_at),
  CHECK (
    (state = 'purged' AND purged_at IS NOT NULL)
    OR (state <> 'purged' AND purged_at IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS face_template_sets_one_active_model_idx
  ON face_template_sets (identity_id, model_name, model_version)
  WHERE state = 'active';
CREATE INDEX IF NOT EXISTS face_template_sets_purge_idx
  ON face_template_sets (state, expires_at)
  WHERE state IN ('active', 'purge_pending');

CREATE TABLE IF NOT EXISTS face_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id text NOT NULL UNIQUE CHECK (
    length(BTRIM(content_id)) BETWEEN 1 AND 300
    AND content_id = BTRIM(content_id)
    AND content_id <> '*'
    AND POSITION('://' IN content_id) = 0
    AND content_id !~ '[[:space:]]'
  ),
  display_name text NOT NULL CHECK (length(BTRIM(display_name)) BETWEEN 1 AND 160),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{0,39}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('live', 'archive')),
  -- Reference only (for example env:FACE_SOURCE_RON or secret:streams/ron).
  -- Raw URLs, credentials, query strings and stream keys do not belong here.
  ingest_locator_ref text CHECK (
    ingest_locator_ref IS NULL
    OR (
      length(ingest_locator_ref) <= 500
      AND ingest_locator_ref ~ '^(env|secret|mediamtx|file-ref):[A-Za-z0-9][A-Za-z0-9._/-]*$'
      AND ingest_locator_ref !~ '(^|[:/])\.{1,2}(/|$)'
    )
  ),
  state text NOT NULL DEFAULT 'disabled' CHECK (state IN ('disabled', 'active', 'archived')),
  operation_mode text NOT NULL DEFAULT 'manual_only'
    CHECK (operation_mode IN ('manual_only', 'review_only', 'automatic')),
  all_visible_people_consented boolean NOT NULL DEFAULT false,
  recognition_enabled boolean NOT NULL DEFAULT false,
  automatic_matching_enabled boolean NOT NULL DEFAULT false,
  automatic_publish_enabled boolean NOT NULL DEFAULT false,
  kill_switch_active boolean NOT NULL DEFAULT false,
  kill_switch_reason text CHECK (kill_switch_reason IS NULL OR length(BTRIM(kill_switch_reason)) BETWEEN 3 AND 500),
  active_session_id text CHECK (active_session_id IS NULL OR length(BTRIM(active_session_id)) BETWEEN 1 AND 200),
  last_frame_at timestamptz,
  error_message text CHECK (error_message IS NULL OR length(error_message) <= 2000),
  live_active boolean NOT NULL DEFAULT false,
  live_started_at timestamptz,
  live_ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT automatic_matching_enabled OR all_visible_people_consented),
  CHECK (NOT recognition_enabled OR (state = 'active' AND NOT kill_switch_active)),
  CHECK (NOT automatic_matching_enabled OR recognition_enabled),
  -- Reserved for a separately reviewed future migration. The first release
  -- deliberately has no automatic publication path.
  CHECK (automatic_publish_enabled = false),
  CHECK (NOT live_active OR (source_kind = 'live' AND state = 'active' AND live_started_at IS NOT NULL AND live_ended_at IS NULL)),
  CHECK (live_ended_at IS NULL OR (live_started_at IS NOT NULL AND live_ended_at >= live_started_at))
);
-- Reconcile the inline CHECK from pre-release drafts. PostgreSQL's ARE engine
-- rejects repetition bounds above 255 at evaluation time, so an older
-- oversized repetition constraint must be replaced even when the table exists.
ALTER TABLE face_sources
  DROP CONSTRAINT IF EXISTS face_sources_ingest_locator_ref_check;
ALTER TABLE face_sources
  ADD CONSTRAINT face_sources_ingest_locator_ref_check CHECK (
    ingest_locator_ref IS NULL
    OR (
      length(ingest_locator_ref) <= 500
      AND ingest_locator_ref ~ '^(env|secret|mediamtx|file-ref):[A-Za-z0-9][A-Za-z0-9._/-]*$'
      AND ingest_locator_ref !~ '(^|[:/])\.{1,2}(/|$)'
    )
  );
CREATE INDEX IF NOT EXISTS face_sources_live_idx
  ON face_sources (content_id)
  WHERE source_kind = 'live' AND state = 'active' AND live_active;

CREATE TABLE IF NOT EXISTS face_source_identities (
  source_id uuid NOT NULL REFERENCES face_sources(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  consent_id uuid NOT NULL,
  added_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, identity_id),
  FOREIGN KEY (consent_id, identity_id)
    REFERENCES face_consents(id, identity_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS face_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES face_sources(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('live_scan', 'archive_scan', 'manual_review')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text NOT NULL CHECK (length(BTRIM(idempotency_key)) BETWEEN 8 AND 200),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  requested_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  lease_owner text,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 2000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, idempotency_key),
  CHECK (
    status NOT IN ('leased', 'running')
    OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS face_jobs_queue_idx
  ON face_jobs (created_at)
  WHERE status = 'queued';

-- Operational liveness only. This table never stores frames, crops, vectors,
-- identities, similarity output, or enrollment material. The admin service
-- may report the analyzer ready only while a healthy heartbeat is fresh.
CREATE TABLE IF NOT EXISTS face_worker_heartbeats (
  worker_id text PRIMARY KEY CHECK (
    length(BTRIM(worker_id)) BETWEEN 1 AND 160
    AND worker_id = BTRIM(worker_id)
    AND worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  ),
  analyzer_version text NOT NULL CHECK (length(BTRIM(analyzer_version)) BETWEEN 1 AND 120),
  automatic_capable boolean NOT NULL DEFAULT false,
  model_name text,
  model_version text,
  status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'stopping', 'error')),
  error_message text CHECK (error_message IS NULL OR length(BTRIM(error_message)) <= 1000),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT face_worker_heartbeat_capability_model_check CHECK (
    (automatic_capable AND model_name = 'opencv_sface' AND model_version IS NOT NULL)
    OR (NOT automatic_capable AND model_name IS NULL AND model_version IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS face_worker_heartbeats_fresh_idx
  ON face_worker_heartbeats (last_heartbeat_at DESC);

-- Reconcile the immediately preceding unreleased draft of migration 024. That
-- draft required model fields on every heartbeat and had no capability bit.
-- This remains safe and idempotent on both a fresh database and a dev database
-- that exercised the draft: old verified-model rows become automatic-capable,
-- while future manual/purge-only rows use NULL model metadata.
ALTER TABLE face_worker_heartbeats
  ADD COLUMN IF NOT EXISTS automatic_capable boolean NOT NULL DEFAULT false;
ALTER TABLE face_worker_heartbeats ALTER COLUMN model_name DROP NOT NULL;
ALTER TABLE face_worker_heartbeats ALTER COLUMN model_name DROP DEFAULT;
ALTER TABLE face_worker_heartbeats ALTER COLUMN model_version DROP NOT NULL;
UPDATE face_worker_heartbeats
   SET automatic_capable = (model_version IS NOT NULL)
 WHERE automatic_capable IS DISTINCT FROM (model_version IS NOT NULL);
DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraints.conname
      FROM pg_constraint constraints
     WHERE constraints.conrelid = 'public.face_worker_heartbeats'::regclass
       AND constraints.contype = 'c'
       AND (
         pg_get_constraintdef(constraints.oid) ILIKE '%model_name%'
         OR pg_get_constraintdef(constraints.oid) ILIKE '%model_version%'
         OR pg_get_constraintdef(constraints.oid) ILIKE '%automatic_capable%'
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.face_worker_heartbeats DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
  ALTER TABLE public.face_worker_heartbeats
    ADD CONSTRAINT face_worker_heartbeat_capability_model_check CHECK (
      (automatic_capable AND model_name = 'opencv_sface'
        AND model_version ~ '^[a-f0-9]{64}$')
      OR (NOT automatic_capable AND model_name IS NULL AND model_version IS NULL)
    );
END;
$$;

CREATE TABLE IF NOT EXISTS face_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES face_sources(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES face_jobs(id) ON DELETE SET NULL,
  external_track_ref text CHECK (external_track_ref IS NULL OR length(BTRIM(external_track_ref)) BETWEEN 1 AND 200),
  identity_id uuid,
  consent_id uuid,
  match_method text NOT NULL CHECK (match_method IN ('manual', 'automatic')),
  state text NOT NULL DEFAULT 'proposed'
    CHECK (state IN ('proposed', 'unknown', 'approved', 'rejected', 'published', 'withdrawn')),
  start_ms bigint NOT NULL CHECK (start_ms >= 0),
  end_ms bigint CHECK (end_ms IS NULL OR end_ms > start_ms),
  bbox_x real,
  bbox_y real,
  bbox_width real,
  bbox_height real,
  similarity_score real CHECK (similarity_score IS NULL OR similarity_score BETWEEN 0 AND 1),
  similarity_margin real CHECK (similarity_margin IS NULL OR similarity_margin BETWEEN 0 AND 1),
  public_confidence_band text CHECK (public_confidence_band IN ('reviewed', 'high')),
  evidence_key text CHECK (evidence_key IS NULL OR length(BTRIM(evidence_key)) BETWEEN 1 AND 1000),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(BTRIM(review_note)) <= 500),
  source_moment_verified boolean NOT NULL DEFAULT false,
  published_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  withdrawn_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (consent_id, identity_id)
    REFERENCES face_consents(id, identity_id) ON DELETE RESTRICT,
  UNIQUE (source_id, external_track_ref),
  CHECK (
    (bbox_x IS NULL AND bbox_y IS NULL AND bbox_width IS NULL AND bbox_height IS NULL)
    OR (
      bbox_x BETWEEN 0 AND 1 AND bbox_y BETWEEN 0 AND 1
      AND bbox_width > 0 AND bbox_width <= 1
      AND bbox_height > 0 AND bbox_height <= 1
      AND bbox_x + bbox_width <= 1.0001
      AND bbox_y + bbox_height <= 1.0001
    )
  ),
  CHECK ((identity_id IS NULL) = (consent_id IS NULL)),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (
    state NOT IN ('approved', 'published')
    OR (identity_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND source_moment_verified)
  ),
  CHECK (
    state <> 'published'
    OR (published_by IS NOT NULL AND published_at IS NOT NULL AND public_confidence_band IS NOT NULL)
  ),
  CHECK (state <> 'rejected' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (state <> 'withdrawn' OR withdrawn_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS face_tracks_review_idx
  ON face_tracks (state, created_at)
  WHERE state = 'proposed';
CREATE INDEX IF NOT EXISTS face_tracks_public_timeline_idx
  ON face_tracks (source_id, start_ms, end_ms)
  WHERE state = 'published';
CREATE INDEX IF NOT EXISTS face_tracks_live_idx
  ON face_tracks (source_id, last_seen_at DESC)
  WHERE state = 'published' AND end_ms IS NULL;

-- Cancellation is also a privacy transition: unreviewed worker output must not
-- remain visible in the review queue after the job authority is withdrawn.
CREATE OR REPLACE FUNCTION face_apply_job_cancellation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purged_count integer;
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
    DELETE FROM face_tracks
     WHERE job_id = NEW.id AND state IN ('proposed', 'unknown');
    GET DIAGNOSTICS purged_count = ROW_COUNT;
    IF purged_count > 0 THEN
      INSERT INTO face_audit_log (
        actor_type, actor_id, action, target_type, target_id, source_id, after_state
      ) VALUES (
        'system', 'job-cancellation-trigger', 'face.job.cancelled_proposals_purged',
        'face_job', NEW.id::text, NEW.source_id,
        jsonb_build_object('privateProposalsPurged', purged_count)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_jobs_cancelled_proposal_purge ON face_jobs;
CREATE TRIGGER face_jobs_cancelled_proposal_purge
AFTER UPDATE OF status ON face_jobs
FOR EACH ROW EXECUTE FUNCTION face_apply_job_cancellation();

CREATE TABLE IF NOT EXISTS face_audit_log (
  id bigserial PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('staff', 'worker', 'system')),
  actor_id text NOT NULL CHECK (length(BTRIM(actor_id)) BETWEEN 1 AND 200),
  actor_email text,
  action text NOT NULL CHECK (action ~ '^[a-z0-9_.-]{3,100}$'),
  target_type text NOT NULL CHECK (target_type ~ '^[a-z0-9_.-]{3,80}$'),
  target_id text NOT NULL CHECK (length(BTRIM(target_id)) BETWEEN 1 AND 200),
  identity_id uuid,
  source_id uuid,
  before_state jsonb,
  after_state jsonb,
  request_id text CHECK (request_id IS NULL OR length(BTRIM(request_id)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS face_audit_target_idx
  ON face_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS face_audit_identity_idx
  ON face_audit_log (identity_id, created_at DESC)
  WHERE identity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION face_guard_audit_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND OLD.created_at < now() - interval '30 days'
     AND current_setting('coreboys.face_audit_retention', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'face audit records are append-only';
END;
$$;
DROP TRIGGER IF EXISTS face_audit_log_immutable ON face_audit_log;
CREATE TRIGGER face_audit_log_immutable
BEFORE UPDATE OR DELETE ON face_audit_log
FOR EACH ROW EXECUTE FUNCTION face_guard_audit_immutability();

CREATE OR REPLACE FUNCTION purge_face_audit_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE deleted_count integer;
BEGIN
  PERFORM set_config('coreboys.face_audit_retention', 'on', true);
  DELETE FROM public.face_audit_log
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION purge_face_audit_retention() FROM PUBLIC;

-- Consent grants are append-only. Permissions or evidence can never be edited
-- in place; revoke the old grant and insert a new grant instead.
CREATE OR REPLACE FUNCTION face_guard_consent_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'face consent records are append-only; revoke instead';
  END IF;
  IF NEW.identity_id IS DISTINCT FROM OLD.identity_id
     OR NEW.consent_version IS DISTINCT FROM OLD.consent_version
     OR NEW.capture_method IS DISTINCT FROM OLD.capture_method
     OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
     OR NEW.consent_text_sha256 IS DISTINCT FROM OLD.consent_text_sha256
     OR NEW.subject_confirmed_adult IS DISTINCT FROM OLD.subject_confirmed_adult
     OR NEW.adult_verified_at IS DISTINCT FROM OLD.adult_verified_at
     OR NEW.allow_template_creation IS DISTINCT FROM OLD.allow_template_creation
     OR NEW.allow_live_matching IS DISTINCT FROM OLD.allow_live_matching
     OR NEW.allow_archive_matching IS DISTINCT FROM OLD.allow_archive_matching
     OR NEW.allow_public_tag IS DISTINCT FROM OLD.allow_public_tag
     OR NEW.allow_profile_links IS DISTINCT FROM OLD.allow_profile_links
     OR NEW.approved_content_ids IS DISTINCT FROM OLD.approved_content_ids
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'face consent grants are immutable; revoke and re-grant';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (
    NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
    OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
  ) THEN
    RAISE EXCEPTION 'face consent revocation is irreversible';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_consents_immutable_update ON face_consents;
CREATE TRIGGER face_consents_immutable_update
BEFORE UPDATE ON face_consents
FOR EACH ROW EXECUTE FUNCTION face_guard_consent_immutability();
DROP TRIGGER IF EXISTS face_consents_no_delete ON face_consents;
CREATE TRIGGER face_consents_no_delete
BEFORE DELETE ON face_consents
FOR EACH ROW EXECUTE FUNCTION face_guard_consent_immutability();

CREATE OR REPLACE FUNCTION face_guard_archive_scope_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_row face_consents%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'face consent archive scopes are immutable; revoke and re-grant';
  END IF;
  SELECT * INTO grant_row FROM face_consents
   WHERE id = NEW.consent_id AND identity_id = NEW.identity_id;
  IF grant_row.id IS NULL OR grant_row.revoked_at IS NOT NULL
     OR grant_row.expires_at <= now()
     OR NOT (NEW.content_id = ANY(grant_row.approved_content_ids)) THEN
    RAISE EXCEPTION 'archive scope must belong to a current exact consent grant';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_consent_archive_scopes_immutable ON face_consent_archive_scopes;
CREATE TRIGGER face_consent_archive_scopes_immutable
BEFORE INSERT OR UPDATE OR DELETE ON face_consent_archive_scopes
FOR EACH ROW EXECUTE FUNCTION face_guard_archive_scope_mutation();

CREATE OR REPLACE FUNCTION face_validate_consent_archive_scopes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.allow_archive_matching OR NEW.allow_public_tag)
     AND NOT EXISTS (
       SELECT 1 FROM face_consent_archive_scopes scopes WHERE scopes.consent_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'archive/public consent requires at least one bounded archive scope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.approved_content_ids) approved(content_id)
     WHERE NOT EXISTS (
       SELECT 1 FROM face_consent_archive_scopes scopes
        WHERE scopes.consent_id = NEW.id AND scopes.content_id = approved.content_id
     )
  ) OR EXISTS (
    SELECT 1 FROM face_consent_archive_scopes scopes
     WHERE scopes.consent_id = NEW.id
       AND NOT (scopes.content_id = ANY(NEW.approved_content_ids))
  ) THEN
    RAISE EXCEPTION 'approved content IDs must exactly match immutable archive scopes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_consents_archive_scope_validation ON face_consents;
CREATE CONSTRAINT TRIGGER face_consents_archive_scope_validation
AFTER INSERT OR UPDATE ON face_consents
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION face_validate_consent_archive_scopes();

CREATE OR REPLACE FUNCTION face_guard_biometric_consent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_row face_consents%ROWTYPE;
BEGIN
  SELECT * INTO grant_row
  FROM face_consents
  WHERE id = NEW.consent_id AND identity_id = NEW.identity_id;
  IF grant_row.id IS NULL OR grant_row.revoked_at IS NOT NULL OR grant_row.expires_at <= now()
     OR NOT grant_row.subject_confirmed_adult
     OR NOT grant_row.allow_template_creation THEN
    RAISE EXCEPTION 'current adult template consent is required';
  END IF;
  IF TG_TABLE_NAME = 'face_reference_assets' AND NEW.retention_expires_at > grant_row.expires_at THEN
    RAISE EXCEPTION 'reference retention cannot exceed consent expiry';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_reference_assets_consent_guard ON face_reference_assets;
CREATE TRIGGER face_reference_assets_consent_guard
BEFORE INSERT OR UPDATE OF identity_id, consent_id, retention_expires_at
ON face_reference_assets
FOR EACH ROW EXECUTE FUNCTION face_guard_biometric_consent();
CREATE OR REPLACE FUNCTION face_guard_template_set_consent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_row face_consents%ROWTYPE;
BEGIN
  -- Revocation/expiry transitions must always be able to fail closed even
  -- after the underlying grant is no longer current.
  IF NEW.state <> 'active' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO grant_row
    FROM face_consents
   WHERE id = NEW.consent_id AND identity_id = NEW.identity_id;
  IF grant_row.id IS NULL OR grant_row.revoked_at IS NOT NULL
     OR grant_row.expires_at <= now() OR NOT grant_row.subject_confirmed_adult
     OR NOT grant_row.allow_template_creation THEN
    RAISE EXCEPTION 'current adult template consent is required';
  END IF;
  IF NEW.expires_at > grant_row.expires_at THEN
    RAISE EXCEPTION 'template-set retention cannot exceed consent expiry';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(NEW.reference_hashes) AS supplied(content_sha256)
     WHERE NOT EXISTS (
       SELECT 1
         FROM face_reference_assets refs
        WHERE refs.identity_id = NEW.identity_id
          AND refs.consent_id = NEW.consent_id
          AND refs.content_sha256 = supplied.content_sha256
          AND refs.state = 'approved'
          AND refs.reviewed_by IS NOT NULL
          AND refs.reviewed_by <> refs.created_by
          AND refs.retention_expires_at > now()
     )
  ) THEN
    RAISE EXCEPTION 'every template reference requires current independent approval';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_template_sets_consent_guard ON face_template_sets;
CREATE TRIGGER face_template_sets_consent_guard
BEFORE INSERT OR UPDATE OF
  identity_id, consent_id, model_name, model_version, template_fingerprint,
  template_count, reference_hashes, worker_id, expires_at, state
ON face_template_sets
FOR EACH ROW EXECUTE FUNCTION face_guard_template_set_consent();

CREATE OR REPLACE FUNCTION face_guard_reference_review_independence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE consent_recorder uuid;
BEGIN
  IF NEW.state = 'approved' AND OLD.state IS DISTINCT FROM 'approved' THEN
    SELECT granted_by INTO consent_recorder
      FROM face_consents
     WHERE id = NEW.consent_id AND identity_id = NEW.identity_id;
    IF NEW.reviewed_by IS NULL
       OR NEW.reviewed_by = OLD.created_by
       OR NEW.reviewed_by = consent_recorder THEN
      RAISE EXCEPTION 'reference enrollment requires an independent second staff reviewer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_reference_assets_independent_review ON face_reference_assets;
CREATE TRIGGER face_reference_assets_independent_review
BEFORE UPDATE OF state, reviewed_by ON face_reference_assets
FOR EACH ROW EXECUTE FUNCTION face_guard_reference_review_independence();

CREATE OR REPLACE FUNCTION face_guard_source_allowlist()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_row face_consents%ROWTYPE;
DECLARE kind_value text;
DECLARE content_value text;
BEGIN
  SELECT * INTO grant_row
  FROM face_consents
  WHERE id = NEW.consent_id AND identity_id = NEW.identity_id;
  SELECT source_kind, content_id INTO kind_value, content_value
    FROM face_sources WHERE id = NEW.source_id;
  IF grant_row.id IS NULL OR kind_value IS NULL
     OR grant_row.revoked_at IS NOT NULL OR grant_row.expires_at <= now()
     OR NOT grant_row.subject_confirmed_adult
     OR kind_value = 'live'
     OR (kind_value = 'archive' AND NOT grant_row.allow_archive_matching)
     OR NOT (content_value = ANY(grant_row.approved_content_ids))
     OR NOT EXISTS (
       SELECT 1 FROM face_consent_archive_scopes scopes
        WHERE scopes.consent_id = grant_row.id AND scopes.content_id = content_value
     ) THEN
    RAISE EXCEPTION 'current adult matching consent is required for this source';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_source_identities_consent_guard ON face_source_identities;
CREATE TRIGGER face_source_identities_consent_guard
BEFORE INSERT OR UPDATE ON face_source_identities
FOR EACH ROW EXECUTE FUNCTION face_guard_source_allowlist();

CREATE OR REPLACE FUNCTION face_guard_track_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_row face_consents%ROWTYPE;
DECLARE content_value text;
DECLARE kind_value text;
BEGIN
  IF NEW.state NOT IN ('approved', 'published') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO grant_row
  FROM face_consents
  WHERE id = NEW.consent_id AND identity_id = NEW.identity_id;
  SELECT content_id, source_kind INTO content_value, kind_value FROM face_sources WHERE id = NEW.source_id;
  IF grant_row.id IS NULL OR grant_row.revoked_at IS NOT NULL OR grant_row.expires_at <= now()
     OR NOT grant_row.subject_confirmed_adult THEN
    RAISE EXCEPTION 'current adult consent is required to approve a face track';
  END IF;
  IF content_value IS NULL OR NOT (content_value = ANY(grant_row.approved_content_ids)) THEN
    RAISE EXCEPTION 'the source content id is outside this consent grant';
  END IF;
  IF kind_value <> 'archive' OR NEW.end_ms IS NULL OR NOT EXISTS (
    SELECT 1 FROM face_consent_archive_scopes scopes
     WHERE scopes.consent_id = grant_row.id
       AND scopes.content_id = content_value
       AND scopes.start_ms <= NEW.start_ms
       AND scopes.end_ms >= NEW.end_ms
  ) THEN
    RAISE EXCEPTION 'v1 tracks must fit wholly inside an immutable archive consent interval';
  END IF;
  IF NEW.state = 'published'
     AND (NOT grant_row.allow_public_tag OR NOT grant_row.allow_profile_links) THEN
    RAISE EXCEPTION 'public tag and profile-link consent are required to publish';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_tracks_publication_guard ON face_tracks;
CREATE TRIGGER face_tracks_publication_guard
BEFORE INSERT OR UPDATE OF state, identity_id, consent_id
ON face_tracks
FOR EACH ROW EXECUTE FUNCTION face_guard_track_publication();

-- A revocation takes effect immediately in the same transaction: template
-- metadata enters the local-worker purge queue, references enter the physical-
-- deletion queue, allowlists are removed and every linked proposed/public track
-- is withdrawn. The worker must confirm deletion before a template set is marked
-- purged; biometric vectors never live in this web database.
CREATE OR REPLACE FUNCTION face_apply_consent_revocation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    UPDATE face_template_sets
       SET state = CASE WHEN state = 'purged' THEN state ELSE 'purge_pending' END,
           error_message = CASE WHEN state = 'purged' THEN error_message ELSE 'Consent revoked; local purge required.' END,
           updated_at = now()
     WHERE consent_id = NEW.id;
    UPDATE face_reference_assets
       SET state = CASE WHEN state = 'deleted' THEN state ELSE 'deletion_pending' END,
           revoked_at = COALESCE(revoked_at, NEW.revoked_at),
           deletion_requested_at = COALESCE(deletion_requested_at, NEW.revoked_at),
           updated_at = now()
     WHERE consent_id = NEW.id;
    DELETE FROM face_source_identities WHERE consent_id = NEW.id;
    UPDATE face_tracks
       SET state = 'withdrawn',
           withdrawn_by = NEW.revoked_by,
           withdrawn_at = NEW.revoked_at,
           updated_at = now()
     WHERE consent_id = NEW.id AND state <> 'withdrawn';
    UPDATE face_identities
       SET state = CASE WHEN state = 'active' THEN 'draft' ELSE state END,
           updated_at = now()
     WHERE id = NEW.identity_id;
    INSERT INTO face_audit_log (
      actor_type, actor_id, action, target_type, target_id, identity_id, after_state
    ) VALUES (
      'system', 'consent-revocation-trigger', 'consent.revocation_propagated',
      'face_consent', NEW.id::text, NEW.identity_id,
      jsonb_build_object(
        'revokedAt', NEW.revoked_at,
        'localTemplatePurgeQueued', true,
        'referenceDeletionQueued', true
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS face_consents_revocation_propagation ON face_consents;
CREATE TRIGGER face_consents_revocation_propagation
AFTER UPDATE OF revoked_at ON face_consents
FOR EACH ROW EXECUTE FUNCTION face_apply_consent_revocation();

-- The only DB object intended for public presence reads. Canonical public
-- display data is resolved in application code from the roster by kind+slug.
CREATE OR REPLACE VIEW face_presence_public_safe
WITH (security_barrier = TRUE) AS
SELECT
  tracks.id AS track_id,
  tracks.source_id,
  sources.content_id,
  sources.source_kind,
  sources.live_active,
  identities.id AS identity_id,
  identities.canonical_kind,
  identities.canonical_slug,
  tracks.start_ms,
  tracks.end_ms,
  tracks.bbox_x,
  tracks.bbox_y,
  tracks.bbox_width,
  tracks.bbox_height,
  tracks.public_confidence_band AS confidence_band,
  tracks.last_seen_at
FROM face_tracks tracks
JOIN face_sources sources ON sources.id = tracks.source_id
JOIN face_identities identities ON identities.id = tracks.identity_id
JOIN face_consents consents
  ON consents.id = tracks.consent_id AND consents.identity_id = tracks.identity_id
WHERE tracks.state = 'published'
  AND sources.state = 'active'
  AND identities.state = 'active'
  AND identities.revoked_at IS NULL
  AND consents.revoked_at IS NULL
  AND consents.expires_at > now()
  AND consents.subject_confirmed_adult
  AND consents.allow_public_tag
  AND consents.allow_profile_links
  AND sources.content_id = ANY(consents.approved_content_ids)
  AND sources.source_kind = 'archive'
  AND tracks.end_ms IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM face_consent_archive_scopes scopes
     WHERE scopes.consent_id = consents.id
       AND scopes.content_id = sources.content_id
       AND scopes.start_ms <= tracks.start_ms
       AND scopes.end_ms >= tracks.end_ms
  );

COMMENT ON VIEW face_presence_public_safe IS
  'Public-safe face presence only: excludes biometrics, scores, evidence, consent evidence and private source locators.';

-- -------------------------------------------------------------------------
-- Least-privilege worker bridge
-- -------------------------------------------------------------------------
-- The analyzer role receives EXECUTE on these narrowly scoped functions, not
-- direct UPDATE/INSERT privileges on jobs, tracks, template metadata or the
-- append-only audit log. Each mutation re-evaluates DB-authoritative consent,
-- source, interval and lease state inside the same transaction.

CREATE OR REPLACE FUNCTION face_worker_job_is_authorized(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT
      sources.state = 'active'
      AND sources.source_kind = 'archive'
      AND NOT sources.kill_switch_active
      AND NOT sources.automatic_publish_enabled
      AND jobs.kind IN ('archive_scan', 'manual_review')
      AND jsonb_typeof(jobs.configuration) = 'object'
      AND jobs.configuration ? 'startMs'
      AND jobs.configuration ? 'endMs'
      AND jsonb_typeof(jobs.configuration->'startMs') = 'number'
      AND jsonb_typeof(jobs.configuration->'endMs') = 'number'
      AND bounds.start_ms IS NOT NULL
      AND bounds.end_ms IS NOT NULL
      AND bounds.start_ms >= 0
      AND bounds.end_ms > bounds.start_ms
      AND bounds.end_ms <= 9007199254740991
      AND NOT EXISTS (
        SELECT 1
          FROM jsonb_object_keys(jobs.configuration) AS supplied(key)
         WHERE supplied.key NOT IN ('samplingFps', 'startMs', 'endMs')
      )
      AND (
        NOT (jobs.configuration ? 'samplingFps')
        OR (
          jsonb_typeof(jobs.configuration->'samplingFps') = 'number'
          AND CASE
            WHEN (jobs.configuration->>'samplingFps') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN (jobs.configuration->>'samplingFps')::numeric > 0
              AND (jobs.configuration->>'samplingFps')::numeric <= 5
            ELSE false
          END
        )
      )
      AND (
        jobs.kind = 'manual_review'
        OR (
          sources.operation_mode = 'review_only'
          AND sources.recognition_enabled
          AND sources.automatic_matching_enabled
          AND sources.all_visible_people_consented
          AND EXISTS (
            SELECT 1 FROM face_source_identities allowed
             WHERE allowed.source_id = sources.id
          )
          AND NOT EXISTS (
            SELECT 1
              FROM face_source_identities allowed
             WHERE allowed.source_id = sources.id
               AND NOT EXISTS (
                 SELECT 1
                   FROM face_consents consents
                  WHERE consents.id = allowed.consent_id
                    AND consents.identity_id = allowed.identity_id
                    AND consents.revoked_at IS NULL
                    AND consents.expires_at > now()
                    AND consents.subject_confirmed_adult
                    AND consents.allow_template_creation
                    AND consents.allow_archive_matching
                    AND sources.content_id = ANY(consents.approved_content_ids)
                    AND EXISTS (
                      SELECT 1 FROM face_consent_archive_scopes scopes
                       WHERE scopes.consent_id = consents.id
                         AND scopes.identity_id = consents.identity_id
                         AND scopes.content_id = sources.content_id
                         AND scopes.start_ms <= bounds.start_ms
                         AND scopes.end_ms >= bounds.end_ms
                    )
                    AND EXISTS (
                      SELECT 1 FROM face_template_sets templates
                       WHERE templates.identity_id = consents.identity_id
                         AND templates.consent_id = consents.id
                         AND templates.state = 'active'
                         AND templates.expires_at > now()
                    )
               )
          )
        )
      )
      FROM face_jobs jobs
      JOIN face_sources sources ON sources.id = jobs.source_id
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN (jobs.configuration->>'startMs') ~ '^[0-9]{1,16}$'
            THEN (jobs.configuration->>'startMs')::numeric
          END AS start_ms,
          CASE
            WHEN (jobs.configuration->>'endMs') ~ '^[0-9]{1,16}$'
            THEN (jobs.configuration->>'endMs')::numeric
          END AS end_ms
      ) bounds
     WHERE jobs.id = p_job_id
  ), false);
$$;
REVOKE ALL ON FUNCTION face_worker_job_is_authorized(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION face_worker_can_run_job(
  p_job_id uuid,
  p_worker_id text,
  p_allow_automatic boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT face_worker_job_is_authorized(p_job_id)
    AND COALESCE((
      SELECT jobs.kind = 'manual_review'
        OR (
          p_allow_automatic
          AND heartbeats.automatic_capable
          AND heartbeats.status = 'healthy'
          AND heartbeats.last_heartbeat_at >= now() - interval '90 seconds'
          AND heartbeats.model_name = 'opencv_sface'
          AND heartbeats.model_version IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
              FROM face_source_identities allowed
             WHERE allowed.source_id = jobs.source_id
               AND NOT EXISTS (
                 SELECT 1 FROM face_template_sets templates
                  WHERE templates.identity_id = allowed.identity_id
                    AND templates.consent_id = allowed.consent_id
                    AND templates.worker_id = p_worker_id
                    AND templates.model_name = heartbeats.model_name
                    AND templates.model_version = heartbeats.model_version
                    AND templates.state = 'active'
                    AND templates.expires_at > now()
               )
          )
        )
        FROM face_jobs jobs
        LEFT JOIN face_worker_heartbeats heartbeats
          ON heartbeats.worker_id = p_worker_id
       WHERE jobs.id = p_job_id
    ), false);
$$;
REVOKE ALL ON FUNCTION face_worker_can_run_job(uuid, text, boolean) FROM PUBLIC;

-- Drop the pre-capability development signature if an unreleased draft of
-- this migration was exercised locally. The reviewed four-argument RPC below
-- is the only claim entrypoint.
DROP FUNCTION IF EXISTS claim_face_archive_job(text, integer, uuid);
CREATE OR REPLACE FUNCTION claim_face_archive_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60,
  p_job_id uuid DEFAULT NULL,
  p_allow_automatic boolean DEFAULT true
)
RETURNS TABLE (
  job_id uuid,
  source_id uuid,
  content_id text,
  source_kind text,
  job_kind text,
  job_status text,
  configuration jsonb,
  active_session_id text,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE claimed record;
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid face worker id';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'face job lease must be between 30 and 300 seconds';
  END IF;
  IF p_allow_automatic IS NULL THEN
    RAISE EXCEPTION 'face worker capability flag is required';
  END IF;

  SELECT jobs.id
    INTO claimed
    FROM face_jobs jobs
   WHERE (p_job_id IS NULL OR jobs.id = p_job_id)
     AND jobs.attempts < 20
     AND (
       jobs.status = 'queued'
       OR (
         jobs.status IN ('leased', 'running')
         AND jobs.lease_expires_at IS NOT NULL
         AND jobs.lease_expires_at <= now()
       )
     )
     AND face_worker_can_run_job(jobs.id, p_worker_id, p_allow_automatic)
   ORDER BY CASE WHEN jobs.id = p_job_id THEN 0 ELSE 1 END, jobs.created_at, jobs.id
   FOR UPDATE OF jobs SKIP LOCKED
   LIMIT 1;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE face_jobs jobs
     SET status = 'leased',
         lease_owner = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts = jobs.attempts + 1,
         last_error = NULL,
         started_at = COALESCE(jobs.started_at, now()),
         finished_at = NULL,
         updated_at = now()
    FROM face_sources sources
   WHERE jobs.id = claimed.id
     AND sources.id = jobs.source_id
  RETURNING jobs.id AS job_id, sources.id AS source_id,
            sources.content_id AS content_id, sources.source_kind AS source_kind,
            jobs.kind AS job_kind, jobs.status AS job_status,
            jobs.configuration AS configuration,
            sources.active_session_id AS active_session_id,
            jobs.lease_expires_at AS lease_expires_at
       INTO claimed;

  INSERT INTO face_audit_log (
    actor_type, actor_id, action, target_type, target_id, source_id, after_state
  ) VALUES (
    'worker', p_worker_id, 'face.job.leased', 'face_job', claimed.job_id::text,
    claimed.source_id,
    jsonb_build_object(
      'leaseSeconds', p_lease_seconds,
      'targeted', p_job_id IS NOT NULL,
      'automaticCapability', p_allow_automatic
    )
  );

  RETURN QUERY SELECT
    claimed.job_id::uuid, claimed.source_id::uuid, claimed.content_id::text,
    claimed.source_kind::text, claimed.job_kind::text, claimed.job_status::text,
    claimed.configuration::jsonb, claimed.active_session_id::text,
    claimed.lease_expires_at::timestamptz;
END;
$$;
REVOKE ALL ON FUNCTION claim_face_archive_job(text, integer, uuid, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION heartbeat_face_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE changed uuid;
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid face worker id';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'face job lease must be between 30 and 300 seconds';
  END IF;

  UPDATE face_jobs jobs
     SET status = 'running',
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   WHERE jobs.id = p_job_id
     AND jobs.lease_owner = p_worker_id
     AND jobs.status IN ('leased', 'running')
     AND jobs.lease_expires_at > now()
     AND face_worker_can_run_job(jobs.id, p_worker_id, true)
  RETURNING jobs.id INTO changed;
  RETURN changed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION heartbeat_face_job(uuid, text, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION finish_face_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE finished record;
DECLARE safe_error text;
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid face worker id';
  END IF;
  IF p_status NOT IN ('succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid terminal face job status';
  END IF;
  safe_error := NULLIF(BTRIM(LEFT(COALESCE(p_error, ''), 2000)), '');

  UPDATE face_jobs jobs
     SET status = p_status,
         last_error = safe_error,
         finished_at = now(),
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE jobs.id = p_job_id
     AND jobs.lease_owner = p_worker_id
     AND jobs.status IN ('leased', 'running')
     AND jobs.lease_expires_at > now()
  RETURNING jobs.id, jobs.source_id INTO finished;

  IF finished.id IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO face_audit_log (
    actor_type, actor_id, action, target_type, target_id, source_id, after_state
  ) VALUES (
    'worker', p_worker_id, 'face.job.' || p_status, 'face_job', finished.id::text,
    finished.source_id,
    jsonb_build_object('status', p_status, 'hasError', safe_error IS NOT NULL)
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION finish_face_job(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION import_face_track_proposal(
  p_worker_id text,
  p_job_id uuid,
  p_external_track_ref text,
  p_match_method text,
  p_identity_id uuid,
  p_start_ms bigint,
  p_end_ms bigint,
  p_bbox_x real,
  p_bbox_y real,
  p_bbox_width real,
  p_bbox_height real,
  p_similarity_score real,
  p_similarity_margin real
)
RETURNS TABLE (track_id uuid, disposition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE job_row record;
DECLARE existing record;
DECLARE resolved_identity uuid;
DECLARE resolved_consent uuid;
DECLARE next_start bigint;
DECLARE next_end bigint;
DECLARE next_state text;
DECLARE changed_id uuid;
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid face worker id';
  END IF;
  IF p_external_track_ref IS NULL
     OR p_external_track_ref <> BTRIM(p_external_track_ref)
     OR p_external_track_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' THEN
    RAISE EXCEPTION 'invalid external face track reference';
  END IF;
  IF p_match_method NOT IN ('manual', 'automatic') THEN
    RAISE EXCEPTION 'invalid face proposal match method';
  END IF;
  IF p_start_ms IS NULL OR p_end_ms IS NULL
     OR p_start_ms < 0 OR p_end_ms <= p_start_ms THEN
    RAISE EXCEPTION 'face proposal requires a finite positive interval';
  END IF;
  IF (p_bbox_x IS NULL OR p_bbox_y IS NULL OR p_bbox_width IS NULL OR p_bbox_height IS NULL)
     AND NOT (p_bbox_x IS NULL AND p_bbox_y IS NULL AND p_bbox_width IS NULL AND p_bbox_height IS NULL) THEN
    RAISE EXCEPTION 'face proposal bbox must be wholly null or complete';
  END IF;
  IF p_bbox_x IS NOT NULL AND NOT (
    p_bbox_x BETWEEN 0 AND 1 AND p_bbox_y BETWEEN 0 AND 1
    AND p_bbox_width > 0 AND p_bbox_width <= 1
    AND p_bbox_height > 0 AND p_bbox_height <= 1
    AND p_bbox_x + p_bbox_width <= 1.0001
    AND p_bbox_y + p_bbox_height <= 1.0001
  ) THEN
    RAISE EXCEPTION 'face proposal bbox is outside normalized frame bounds';
  END IF;
  IF p_similarity_score IS NOT NULL AND NOT (p_similarity_score BETWEEN 0 AND 1) THEN
    RAISE EXCEPTION 'invalid face similarity score';
  END IF;
  IF p_similarity_margin IS NOT NULL AND NOT (p_similarity_margin BETWEEN 0 AND 1) THEN
    RAISE EXCEPTION 'invalid face similarity margin';
  END IF;
  IF p_match_method = 'manual'
     AND (p_similarity_score IS NOT NULL OR p_similarity_margin IS NOT NULL) THEN
    RAISE EXCEPTION 'manual proposals cannot carry biometric similarity output';
  END IF;

  SELECT jobs.id, jobs.source_id, jobs.kind, jobs.configuration,
         sources.content_id, sources.source_kind
    INTO job_row
    FROM face_jobs jobs
    JOIN face_sources sources ON sources.id = jobs.source_id
   WHERE jobs.id = p_job_id
     AND jobs.lease_owner = p_worker_id
     AND jobs.status IN ('leased', 'running')
     AND jobs.lease_expires_at > now()
     AND face_worker_can_run_job(
       jobs.id,
       p_worker_id,
       p_match_method = 'automatic'
     )
   FOR UPDATE OF jobs;
  IF job_row.id IS NULL THEN
    RAISE EXCEPTION 'face job lease is missing, expired, cancelled, or unauthorized';
  END IF;
  IF (job_row.kind = 'manual_review' AND p_match_method <> 'manual')
     OR (job_row.kind = 'archive_scan' AND p_match_method <> 'automatic') THEN
    RAISE EXCEPTION 'proposal match method does not match the leased job kind';
  END IF;
  IF p_start_ms < (job_row.configuration->>'startMs')::bigint
     OR p_end_ms > (job_row.configuration->>'endMs')::bigint THEN
    RAISE EXCEPTION 'proposal interval exceeds the leased job bounds';
  END IF;

  SELECT tracks.id, tracks.job_id, tracks.identity_id, tracks.consent_id,
         tracks.state, tracks.start_ms, tracks.end_ms
    INTO existing
    FROM face_tracks tracks
   WHERE tracks.source_id = job_row.source_id
     AND tracks.external_track_ref = p_external_track_ref
   FOR UPDATE;
  IF existing.id IS NOT NULL AND existing.job_id IS DISTINCT FROM p_job_id THEN
    RAISE EXCEPTION 'external face track reference belongs to another job';
  END IF;
  IF existing.id IS NOT NULL
     AND existing.state NOT IN ('proposed', 'unknown') THEN
    RETURN QUERY SELECT existing.id::uuid, 'skipped_reviewed'::text;
    RETURN;
  END IF;
  IF existing.identity_id IS NOT NULL
     AND p_identity_id IS NOT NULL
     AND existing.identity_id <> p_identity_id THEN
    RAISE EXCEPTION 'face proposal conflicts with an existing proposed identity';
  END IF;

  resolved_identity := COALESCE(existing.identity_id, p_identity_id);
  next_start := LEAST(COALESCE(existing.start_ms, p_start_ms), p_start_ms);
  next_end := GREATEST(COALESCE(existing.end_ms, p_end_ms), p_end_ms);
  next_state := CASE WHEN resolved_identity IS NULL THEN 'unknown' ELSE 'proposed' END;

  IF resolved_identity IS NOT NULL AND p_match_method = 'automatic' THEN
    SELECT allowed.consent_id
      INTO resolved_consent
      FROM face_source_identities allowed
      JOIN face_consents consents
        ON consents.id = allowed.consent_id AND consents.identity_id = allowed.identity_id
      JOIN face_identities identities ON identities.id = allowed.identity_id
     WHERE allowed.source_id = job_row.source_id
       AND allowed.identity_id = resolved_identity
       AND identities.state = 'active' AND identities.revoked_at IS NULL
       AND consents.revoked_at IS NULL AND consents.expires_at > now()
       AND consents.subject_confirmed_adult
       AND consents.allow_template_creation AND consents.allow_archive_matching
       AND job_row.content_id = ANY(consents.approved_content_ids)
       AND EXISTS (
         SELECT 1 FROM face_consent_archive_scopes scopes
          WHERE scopes.consent_id = consents.id
            AND scopes.identity_id = consents.identity_id
            AND scopes.content_id = job_row.content_id
            AND scopes.start_ms <= next_start AND scopes.end_ms >= next_end
       )
       AND EXISTS (
         SELECT 1 FROM face_template_sets templates
          WHERE templates.identity_id = consents.identity_id
            AND templates.consent_id = consents.id
            AND templates.state = 'active' AND templates.expires_at > now()
       );
  ELSIF resolved_identity IS NOT NULL THEN
    SELECT consents.id
      INTO resolved_consent
      FROM face_consents consents
      JOIN face_identities identities ON identities.id = consents.identity_id
     WHERE consents.identity_id = resolved_identity
       AND identities.state = 'active' AND identities.revoked_at IS NULL
       AND consents.revoked_at IS NULL AND consents.expires_at > now()
       AND consents.subject_confirmed_adult
       AND job_row.content_id = ANY(consents.approved_content_ids)
       AND EXISTS (
         SELECT 1 FROM face_consent_archive_scopes scopes
          WHERE scopes.consent_id = consents.id
            AND scopes.identity_id = consents.identity_id
            AND scopes.content_id = job_row.content_id
            AND scopes.start_ms <= next_start AND scopes.end_ms >= next_end
       );
  END IF;
  IF resolved_identity IS NOT NULL AND resolved_consent IS NULL THEN
    RAISE EXCEPTION 'current exact consent authority is missing for this proposal interval';
  END IF;

  IF existing.id IS NULL THEN
    INSERT INTO face_tracks (
      source_id, job_id, external_track_ref, identity_id, consent_id,
      match_method, state, start_ms, end_ms,
      bbox_x, bbox_y, bbox_width, bbox_height,
      similarity_score, similarity_margin
    ) VALUES (
      job_row.source_id, p_job_id, p_external_track_ref,
      resolved_identity, resolved_consent, p_match_method, next_state,
      next_start, next_end, p_bbox_x, p_bbox_y, p_bbox_width, p_bbox_height,
      p_similarity_score, p_similarity_margin
    ) RETURNING id INTO changed_id;
    disposition := 'inserted';
  ELSE
    UPDATE face_tracks tracks
       SET identity_id = resolved_identity,
           consent_id = resolved_consent,
           match_method = p_match_method,
           state = next_state,
           start_ms = next_start,
           end_ms = next_end,
           bbox_x = p_bbox_x,
           bbox_y = p_bbox_y,
           bbox_width = p_bbox_width,
           bbox_height = p_bbox_height,
           similarity_score = p_similarity_score,
           similarity_margin = p_similarity_margin,
           updated_at = now()
     WHERE tracks.id = existing.id
       AND (tracks.identity_id, tracks.consent_id, tracks.match_method,
            tracks.state, tracks.start_ms, tracks.end_ms,
            tracks.bbox_x, tracks.bbox_y, tracks.bbox_width, tracks.bbox_height,
            tracks.similarity_score, tracks.similarity_margin)
           IS DISTINCT FROM
           (resolved_identity, resolved_consent, p_match_method,
            next_state, next_start, next_end,
            p_bbox_x, p_bbox_y, p_bbox_width, p_bbox_height,
            p_similarity_score, p_similarity_margin)
    RETURNING tracks.id INTO changed_id;
    IF changed_id IS NULL THEN
      RETURN QUERY SELECT existing.id::uuid, 'unchanged'::text;
      RETURN;
    END IF;
    disposition := 'updated';
  END IF;

  INSERT INTO face_audit_log (
    actor_type, actor_id, action, target_type, target_id,
    identity_id, source_id, after_state
  ) VALUES (
    'worker', p_worker_id, 'face.track.' || disposition, 'face_track', changed_id::text,
    resolved_identity, job_row.source_id,
    jsonb_build_object(
      'jobId', p_job_id, 'matchMethod', p_match_method,
      'state', next_state, 'startMs', next_start, 'endMs', next_end
    )
  );
  RETURN QUERY SELECT changed_id, disposition;
END;
$$;
REVOKE ALL ON FUNCTION import_face_track_proposal(
  text, uuid, text, text, uuid, bigint, bigint,
  real, real, real, real, real, real
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION sync_face_template_set(
  p_worker_id text,
  p_identity_id uuid,
  p_consent_id uuid,
  p_model_version text,
  p_template_fingerprint text,
  p_template_count integer,
  p_reference_hashes text[],
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE set_id uuid;
DECLARE normalized_hashes text[];
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid face worker id';
  END IF;
  IF p_model_version IS NULL
     OR p_template_fingerprint IS NULL
     OR p_model_version !~ '^[a-f0-9]{64}$'
     OR p_template_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid face template model or fingerprint';
  END IF;
  IF p_template_count IS NULL OR p_template_count NOT BETWEEN 3 AND 20 THEN
    RAISE EXCEPTION 'invalid face template count';
  END IF;
  SELECT array_agg(DISTINCT value ORDER BY value)
    INTO normalized_hashes
    FROM unnest(p_reference_hashes) AS supplied(value)
   WHERE supplied.value ~ '^[a-f0-9]{64}$';
  IF normalized_hashes IS NULL
     OR cardinality(normalized_hashes) <> cardinality(p_reference_hashes)
     OR cardinality(normalized_hashes) NOT BETWEEN 3 AND 20
     OR cardinality(normalized_hashes) <> p_template_count THEN
    RAISE EXCEPTION 'invalid or duplicate approved reference hashes';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'face template metadata is already expired';
  END IF;
  IF EXISTS (
    SELECT 1 FROM face_template_sets sets
     WHERE sets.identity_id = p_identity_id
       AND sets.model_name = 'opencv_sface'
       AND sets.state = 'active'
       AND (sets.consent_id, sets.model_version)
           IS DISTINCT FROM (p_consent_id, p_model_version)
  ) THEN
    RAISE EXCEPTION 'an active template set must be purged before replacing its consent or model';
  END IF;

  INSERT INTO face_template_sets (
    identity_id, consent_id, model_name, model_version,
    template_fingerprint, template_count, reference_hashes,
    worker_id, state, synced_at, expires_at
  ) VALUES (
    p_identity_id, p_consent_id, 'opencv_sface', p_model_version,
    p_template_fingerprint, p_template_count, normalized_hashes,
    p_worker_id, 'active', now(), p_expires_at
  )
  ON CONFLICT (identity_id, consent_id, model_name, model_version)
  DO UPDATE SET
    template_fingerprint = EXCLUDED.template_fingerprint,
    template_count = EXCLUDED.template_count,
    reference_hashes = EXCLUDED.reference_hashes,
    worker_id = EXCLUDED.worker_id,
    state = 'active',
    synced_at = now(),
    expires_at = EXCLUDED.expires_at,
    purged_at = NULL,
    error_message = NULL,
    updated_at = now()
  RETURNING id INTO set_id;

  INSERT INTO face_audit_log (
    actor_type, actor_id, action, target_type, target_id, identity_id, after_state
  ) VALUES (
    'worker', p_worker_id, 'face.enrollment.local_synced',
    'face_template_set', set_id::text, p_identity_id,
    jsonb_build_object(
      'storage', 'worker_local_only', 'templateCount', p_template_count,
      'modelName', 'opencv_sface', 'modelVersion', p_model_version,
      'localTemplatesDeleted', false
    )
  );
  RETURN set_id;
END;
$$;
REVOKE ALL ON FUNCTION sync_face_template_set(
  text, uuid, uuid, text, text, integer, text[], timestamptz
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION attest_face_template_purged(
  p_template_set_id uuid,
  p_worker_id text,
  p_template_fingerprint text,
  p_reason text DEFAULT 'Local worker confirmed template purge.'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE purged record;
DECLARE safe_reason text;
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
     OR p_template_fingerprint IS NULL
     OR p_template_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid face worker purge attestation';
  END IF;
  safe_reason := NULLIF(BTRIM(LEFT(COALESCE(p_reason, ''), 500)), '');
  IF safe_reason IS NULL THEN
    RAISE EXCEPTION 'face template purge reason is required';
  END IF;

  -- A lost RPC response must not strand a local deletion tombstone forever.
  -- Exact repeats acknowledge the already-committed purge without emitting a
  -- second audit record; any worker/fingerprint/id mismatch still returns false.
  IF EXISTS (
    SELECT 1 FROM face_template_sets sets
     WHERE sets.id = p_template_set_id
       AND sets.worker_id = p_worker_id
       AND sets.template_fingerprint = p_template_fingerprint
       AND sets.state = 'purged'
       AND sets.purged_at IS NOT NULL
  ) THEN
    RETURN true;
  END IF;

  UPDATE face_template_sets sets
     SET state = 'purged',
         purged_at = COALESCE(sets.purged_at, now()),
         error_message = safe_reason,
         updated_at = now()
   WHERE sets.id = p_template_set_id
     AND sets.worker_id = p_worker_id
     AND sets.template_fingerprint = p_template_fingerprint
     AND sets.state IN ('active', 'purge_pending', 'failed')
  RETURNING sets.id, sets.identity_id INTO purged;
  IF purged.id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO face_audit_log (
    actor_type, actor_id, action, target_type, target_id, identity_id, after_state
  ) VALUES (
    'worker', p_worker_id, 'face.enrollment.local_purged',
    'face_template_set', purged.id::text, purged.identity_id,
    jsonb_build_object(
      'storage', 'worker_local_only', 'localTemplatesDeleted', true,
      'reason', safe_reason
    )
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION attest_face_template_purged(uuid, text, text, text) FROM PUBLIC;

DROP FUNCTION IF EXISTS heartbeat_face_worker(text, text, text, text, text);
CREATE OR REPLACE FUNCTION heartbeat_face_worker(
  p_worker_id text,
  p_analyzer_version text,
  p_automatic_capable boolean DEFAULT false,
  p_model_version text DEFAULT NULL,
  p_status text DEFAULT 'healthy',
  p_error text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE heartbeat_at timestamptz := now();
DECLARE safe_error text;
BEGIN
  IF p_worker_id IS NULL
     OR p_worker_id <> BTRIM(p_worker_id)
     OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid face worker id';
  END IF;
  IF p_analyzer_version IS NULL
     OR length(BTRIM(p_analyzer_version)) NOT BETWEEN 1 AND 120
     OR p_automatic_capable IS NULL
     OR p_status NOT IN ('healthy', 'stopping', 'error') THEN
    RAISE EXCEPTION 'invalid face worker heartbeat metadata';
  END IF;
  IF (p_automatic_capable AND (
        p_model_version IS NULL OR p_model_version !~ '^[a-f0-9]{64}$'
      ))
     OR (NOT p_automatic_capable AND p_model_version IS NOT NULL) THEN
    RAISE EXCEPTION 'worker model metadata must exactly match its automatic capability';
  END IF;
  safe_error := NULLIF(BTRIM(LEFT(COALESCE(p_error, ''), 1000)), '');
  IF p_status = 'healthy' THEN safe_error := NULL; END IF;

  INSERT INTO face_worker_heartbeats (
    worker_id, analyzer_version, automatic_capable, model_name, model_version,
    status, error_message, last_heartbeat_at, updated_at
  ) VALUES (
    p_worker_id, BTRIM(p_analyzer_version), p_automatic_capable,
    CASE WHEN p_automatic_capable THEN 'opencv_sface' END, p_model_version,
    p_status, safe_error, heartbeat_at, heartbeat_at
  )
  ON CONFLICT (worker_id) DO UPDATE SET
    analyzer_version = EXCLUDED.analyzer_version,
    automatic_capable = EXCLUDED.automatic_capable,
    model_name = EXCLUDED.model_name,
    model_version = EXCLUDED.model_version,
    status = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    last_heartbeat_at = EXCLUDED.last_heartbeat_at,
    updated_at = EXCLUDED.updated_at;
  RETURN heartbeat_at;
END;
$$;
REVOKE ALL ON FUNCTION heartbeat_face_worker(text, text, boolean, text, text, text) FROM PUBLIC;

-- A local deployment creates this login separately. If the role is provisioned
-- later, rerun this additive migration (or the identical reviewed grant block)
-- before starting the worker. No raw table writes or audit-sequence access are
-- granted in either order.
DO $$
DECLARE target_table text;
DECLARE column_list text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_face_worker') THEN
    -- Remove every legacy table/column write and audit-sequence grant first.
    -- Column ACLs are independent from table ACLs, so both are revoked before
    -- rebuilding the exact read-only authority surface below.
    FOREACH target_table IN ARRAY ARRAY[
      'face_identities', 'face_consents', 'face_consent_archive_scopes',
      'face_reference_assets', 'face_sources', 'face_source_identities',
      'face_template_sets', 'face_jobs', 'face_tracks', 'face_audit_log',
      'face_worker_heartbeats'
    ] LOOP
      SELECT string_agg(quote_ident(attributes.attname), ', ' ORDER BY attributes.attnum)
        INTO column_list
        FROM pg_attribute attributes
       WHERE attributes.attrelid = to_regclass('public.' || target_table)
         AND attributes.attnum > 0
         AND NOT attributes.attisdropped;
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM core_face_worker',
        target_table
      );
      IF column_list IS NOT NULL THEN
        EXECUTE format(
          'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.%2$I FROM core_face_worker',
          column_list,
          target_table
        );
      END IF;
    END LOOP;
    IF to_regclass('public.face_audit_log_id_seq') IS NOT NULL THEN
      EXECUTE 'REVOKE ALL PRIVILEGES ON SEQUENCE public.face_audit_log_id_seq FROM core_face_worker';
    END IF;

    EXECUTE 'GRANT USAGE ON SCHEMA public TO core_face_worker';
    EXECUTE 'GRANT SELECT (id, state, canonical_kind, canonical_slug) ON TABLE public.face_identities TO core_face_worker';
    EXECUTE 'GRANT SELECT (id, identity_id, subject_confirmed_adult, allow_template_creation, allow_live_matching, allow_archive_matching, approved_content_ids, revoked_at, expires_at, created_at) ON TABLE public.face_consents TO core_face_worker';
    EXECUTE 'GRANT SELECT (consent_id, identity_id, content_id, start_ms, end_ms) ON TABLE public.face_consent_archive_scopes TO core_face_worker';
    EXECUTE 'GRANT SELECT (identity_id, consent_id, content_sha256, subject_approved, state, revoked_at, reviewed_at, reviewed_by, created_by, retention_expires_at) ON TABLE public.face_reference_assets TO core_face_worker';
    EXECUTE 'GRANT SELECT (id, content_id, source_kind, state, operation_mode, all_visible_people_consented, recognition_enabled, automatic_matching_enabled, automatic_publish_enabled, kill_switch_active, active_session_id) ON TABLE public.face_sources TO core_face_worker';
    EXECUTE 'GRANT SELECT (source_id, identity_id, consent_id) ON TABLE public.face_source_identities TO core_face_worker';
    EXECUTE 'GRANT SELECT (id, identity_id, consent_id, model_name, model_version, template_fingerprint, template_count, reference_hashes, worker_id, state, expires_at, created_at) ON TABLE public.face_template_sets TO core_face_worker';

    EXECUTE 'GRANT EXECUTE ON FUNCTION claim_face_archive_job(text, integer, uuid, boolean) TO core_face_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION heartbeat_face_job(uuid, text, integer) TO core_face_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION finish_face_job(uuid, text, text, text) TO core_face_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION import_face_track_proposal(text, uuid, text, text, uuid, bigint, bigint, real, real, real, real, real, real) TO core_face_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION sync_face_template_set(text, uuid, uuid, text, text, integer, text[], timestamptz) TO core_face_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION attest_face_template_purged(uuid, text, text, text) TO core_face_worker';
    EXECUTE 'GRANT EXECUTE ON FUNCTION heartbeat_face_worker(text, text, boolean, text, text, text) TO core_face_worker';
  END IF;
END;
$$;

COMMENT ON FUNCTION claim_face_archive_job(text, integer, uuid, boolean) IS
  'Worker RPC: targeted or queue-order claim for bounded, DB-authorized archive/manual face jobs.';
COMMENT ON FUNCTION import_face_track_proposal(
  text, uuid, text, text, uuid, bigint, bigint,
  real, real, real, real, real, real
) IS
  'Worker RPC: imports only proposed/unknown finite archive tracks under an owned live lease; never approves or publishes.';
