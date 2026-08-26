-- Analyze-once deep-media orchestration. Additive and safe to re-run.
-- Existing metadata outputs are retained and assigned to their owning run;
-- no migration deletes segments produced by another stage.

ALTER TABLE media_intelligence_assets ADD COLUMN IF NOT EXISTS source_policy_key text;
CREATE INDEX IF NOT EXISTS media_intelligence_assets_source_policy
  ON media_intelligence_assets(source_policy_key);

ALTER TABLE media_intelligence_analysis_runs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'metadata';
ALTER TABLE media_intelligence_analysis_runs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE media_intelligence_analysis_runs ADD COLUMN IF NOT EXISTS policy_version text NOT NULL DEFAULT 'default-v1';
UPDATE media_intelligence_analysis_runs SET idempotency_key = run_id WHERE idempotency_key IS NULL;
ALTER TABLE media_intelligence_analysis_runs ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS media_intelligence_analysis_idempotency
  ON media_intelligence_analysis_runs(idempotency_key);
ALTER TABLE media_intelligence_analysis_runs
  DROP CONSTRAINT IF EXISTS media_intelligence_analysis_runs_revision_id_analyzer_analyzer_version_input_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS media_intelligence_analysis_stage_input
  ON media_intelligence_analysis_runs(revision_id, analyzer, analyzer_version, stage, input_hash, policy_version);

ALTER TABLE media_intelligence_segments ADD COLUMN IF NOT EXISTS run_id text REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE;
ALTER TABLE media_intelligence_segments ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'metadata';
UPDATE media_intelligence_segments s SET run_id = candidate.run_id
FROM (
  SELECT DISTINCT ON (revision_id) revision_id, run_id
  FROM media_intelligence_analysis_runs
  ORDER BY revision_id, (status = 'succeeded') DESC, finished_at DESC NULLS LAST, started_at DESC
) candidate
WHERE candidate.revision_id = s.revision_id AND s.run_id IS NULL;
ALTER TABLE media_intelligence_segments DROP CONSTRAINT IF EXISTS media_intelligence_segments_revision_id_sequence_kind_key;
CREATE UNIQUE INDEX IF NOT EXISTS media_intelligence_segments_run_sequence_kind
  ON media_intelligence_segments(run_id, sequence, kind) WHERE run_id IS NOT NULL;

ALTER TABLE media_intelligence_tags ADD COLUMN IF NOT EXISTS run_id text REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE;
UPDATE media_intelligence_tags t SET run_id = s.run_id
FROM media_intelligence_segments s WHERE s.segment_id = t.segment_id AND t.run_id IS NULL;
ALTER TABLE media_intelligence_embeddings ADD COLUMN IF NOT EXISTS run_id text REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE;
UPDATE media_intelligence_embeddings e SET run_id = s.run_id
FROM media_intelligence_segments s WHERE s.segment_id = e.segment_id AND e.run_id IS NULL;

CREATE TABLE IF NOT EXISTS media_intelligence_source_policies (
  source_key text PRIMARY KEY,
  platform text NOT NULL,
  rights_status text NOT NULL,
  analysis_mode text NOT NULL,
  media_access_allowed boolean NOT NULL DEFAULT false,
  retention_days integer NOT NULL DEFAULT 30,
  policy_version text NOT NULL,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_intelligence_jobs (
  job_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  asset_key text NOT NULL REFERENCES media_intelligence_assets(asset_key) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  stage text NOT NULL,
  analyzer text NOT NULL,
  analyzer_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','dead-letter','cancelled')),
  priority integer NOT NULL DEFAULT 100,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS media_intelligence_jobs_claim
  ON media_intelligence_jobs(status, available_at, priority, created_at);

CREATE TABLE IF NOT EXISTS media_intelligence_artifacts (
  artifact_id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  kind text NOT NULL,
  provider text NOT NULL,
  uri text,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, kind, content_hash)
);

CREATE TABLE IF NOT EXISTS media_intelligence_index_generations (
  generation_id text PRIMARY KEY,
  provider text NOT NULL,
  index_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('building','active','retired','failed')),
  document_count integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_generation_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  retired_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS media_intelligence_one_active_generation
  ON media_intelligence_index_generations(provider, index_name) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS media_intelligence_tombstones (
  tombstone_id text PRIMARY KEY,
  asset_key text NOT NULL,
  reason text NOT NULL,
  delete_after timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (asset_key, reason)
);
ALTER TABLE media_intelligence_tombstones DROP CONSTRAINT IF EXISTS media_intelligence_tombstones_asset_key_fkey;

CREATE TABLE IF NOT EXISTS media_intelligence_outbox (
  event_id text PRIMARY KEY,
  topic text NOT NULL,
  event_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  error text,
  UNIQUE (topic, event_key)
);
CREATE INDEX IF NOT EXISTS media_intelligence_outbox_pending
  ON media_intelligence_outbox(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS media_intelligence_catalog_syncs (
  sync_id text PRIMARY KEY,
  trigger text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS media_intelligence_archive_checkpoints (
  source_key text PRIMARY KEY,
  provider text NOT NULL,
  member_slug text,
  cursor text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','complete','failed')),
  page_count integer NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS media_intelligence_archive_checkpoint_claim
  ON media_intelligence_archive_checkpoints(status, updated_at);
