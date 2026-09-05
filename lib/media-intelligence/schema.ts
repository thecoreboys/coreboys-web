import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __mediaIntelligencePool: Pool | undefined;
}

const CORE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS media_intelligence_assets (
  asset_key text PRIMARY KEY,
  source_policy_key text,
  platform text NOT NULL,
  external_id text NOT NULL,
  source_url text,
  content_type text NOT NULL,
  format text,
  orientation text,
  creator_slug text,
  creator_label text NOT NULL,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  duration_seconds integer,
  published_at timestamptz,
  is_live boolean NOT NULL DEFAULT false,
  item jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS media_intelligence_assets_source_policy
  ON media_intelligence_assets(source_policy_key);

CREATE TABLE IF NOT EXISTS media_intelligence_revisions (
  revision_id text PRIMARY KEY,
  asset_key text NOT NULL REFERENCES media_intelligence_assets(asset_key) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  content_hash text,
  analyzer_input_hash text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_key, fingerprint)
);
CREATE UNIQUE INDEX IF NOT EXISTS media_intelligence_one_current_revision
  ON media_intelligence_revisions(asset_key) WHERE is_current;

CREATE TABLE IF NOT EXISTS media_intelligence_analysis_runs (
  run_id text PRIMARY KEY,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  analyzer text NOT NULL,
  analyzer_version text NOT NULL,
  input_hash text NOT NULL,
  stage text NOT NULL DEFAULT 'metadata',
  idempotency_key text NOT NULL UNIQUE,
  policy_version text NOT NULL DEFAULT 'default-v1',
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  raw_result jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (revision_id, analyzer, analyzer_version, stage, input_hash, policy_version)
);

CREATE TABLE IF NOT EXISTS media_intelligence_segments (
  segment_id text PRIMARY KEY,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'metadata',
  sequence integer NOT NULL,
  kind text NOT NULL,
  start_seconds double precision,
  end_seconds double precision,
  title text,
  text_content text NOT NULL DEFAULT '',
  search_document text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_document)) STORED,
  evidence text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence, kind)
);
CREATE INDEX IF NOT EXISTS media_intelligence_segments_search_gin
  ON media_intelligence_segments USING gin(search_vector);

CREATE TABLE IF NOT EXISTS media_intelligence_tags (
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  segment_id text NOT NULL REFERENCES media_intelligence_segments(segment_id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE,
  tag text NOT NULL,
  kind text NOT NULL,
  confidence real NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (revision_id, segment_id, tag, kind)
);

CREATE TABLE IF NOT EXISTS media_intelligence_aliases (
  asset_key text NOT NULL REFERENCES media_intelligence_assets(asset_key) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  kind text NOT NULL,
  weight real NOT NULL DEFAULT 1,
  PRIMARY KEY (asset_key, normalized_alias, kind)
);

CREATE TABLE IF NOT EXISTS media_intelligence_embeddings (
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  segment_id text NOT NULL REFERENCES media_intelligence_segments(segment_id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  source_hash text NOT NULL,
  embedding real[] NOT NULL,
  vector_norm real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (revision_id, segment_id, provider, model)
);
CREATE INDEX IF NOT EXISTS media_intelligence_embeddings_lookup
  ON media_intelligence_embeddings(provider, model, revision_id);

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
`;

const EVOLUTION_SQL = `
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
ALTER TABLE media_intelligence_tombstones DROP CONSTRAINT IF EXISTS media_intelligence_tombstones_asset_key_fkey;
`;

const OPTIONAL_ACCELERATORS_SQL = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    BEGIN
      EXECUTE 'ALTER TABLE media_intelligence_embeddings ADD COLUMN IF NOT EXISTS embedding_vector vector(384)';
      EXECUTE 'CREATE INDEX IF NOT EXISTS media_intelligence_embeddings_hnsw ON media_intelligence_embeddings USING hnsw (embedding_vector vector_cosine_ops) WHERE dimensions = 384';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pgvector is installed but its optional media index could not be enabled: %', SQLERRM;
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS media_intelligence_segments_trgm ON media_intelligence_segments USING gin (search_document gin_trgm_ops)';
      EXECUTE 'CREATE INDEX IF NOT EXISTS media_intelligence_aliases_trgm ON media_intelligence_aliases USING gin (normalized_alias gin_trgm_ops)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_trgm is installed but its optional media indexes could not be enabled: %', SQLERRM;
    END;
  END IF;
END $$;
`;

export type MediaIntelligenceCapabilities = {
  vector: boolean;
  trigram: boolean;
};

function isLoopbackDatabase(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function resolvedDatabaseUrl(): string {
  const configured = process.env.MEDIA_INTELLIGENCE_DATABASE_URL?.trim();
  const primary = process.env.DATABASE_URL?.trim();
  if (!configured) {
    if (process.env.MEDIA_INTELLIGENCE_USE_PRIMARY_DATABASE === "true" && primary) return primary;
    throw new Error("MEDIA_INTELLIGENCE_DATABASE_URL is required, or enable the primary database fallback explicitly.");
  }
  if (process.env.MEDIA_INTELLIGENCE_USE_PRIMARY_DATABASE === "true" && primary && isLoopbackDatabase(configured) && !isLoopbackDatabase(primary)) return primary;
  return configured;
}

function databaseUrl(): string {
  const url = resolvedDatabaseUrl();
  if (!isLoopbackDatabase(url) && process.env.MEDIA_INTELLIGENCE_ALLOW_REMOTE_DATABASE !== "true") {
    throw new Error(
      "Media intelligence is local-only. Set MEDIA_INTELLIGENCE_ALLOW_REMOTE_DATABASE=true only after an explicit deployment decision.",
    );
  }
  return url;
}

export function getMediaIntelligencePool(): Pool {
  if (global.__mediaIntelligencePool) return global.__mediaIntelligencePool;
  const url = new URL(databaseUrl());
  const pool = new Pool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: false,
  });
  global.__mediaIntelligencePool = pool;
  return pool;
}

let schemaPromise: Promise<MediaIntelligenceCapabilities> | null = null;

export async function ensureMediaIntelligenceSchema(): Promise<MediaIntelligenceCapabilities> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const pool = getMediaIntelligencePool();
    await pool.query(CORE_SCHEMA_SQL);
    await pool.query(EVOLUTION_SQL);
    await pool.query(OPTIONAL_ACCELERATORS_SQL);
    const result = await pool.query<{ vector: boolean; trigram: boolean }>(`
      SELECT
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS trigram
    `);
    return result.rows[0] ?? { vector: false, trigram: false };
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function withMediaIntelligenceTransaction<T>(
  work: (client: PoolClient, capabilities: MediaIntelligenceCapabilities) => Promise<T>,
): Promise<T> {
  const capabilities = await ensureMediaIntelligenceSchema();
  const client = await getMediaIntelligencePool().connect();
  try {
    await client.query("BEGIN");
    const value = await work(client, capabilities);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function mediaIntelligenceQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  await ensureMediaIntelligenceSchema();
  return getMediaIntelligencePool().query<T>(text, params);
}
