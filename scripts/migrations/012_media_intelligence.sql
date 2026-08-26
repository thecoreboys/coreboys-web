-- Local-first, analyze-once media intelligence index.
-- Safe to re-run. pgvector/pg_trgm acceleration is activated only when those
-- extensions are already installed; neither extension is created here.
CREATE TABLE IF NOT EXISTS media_intelligence_assets (
  asset_key text PRIMARY KEY,
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
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  raw_result jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (revision_id, analyzer, analyzer_version, input_hash)
);

CREATE TABLE IF NOT EXISTS media_intelligence_segments (
  segment_id text PRIMARY KEY,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
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
  UNIQUE (revision_id, sequence, kind)
);
CREATE INDEX IF NOT EXISTS media_intelligence_segments_search_gin
  ON media_intelligence_segments USING gin(search_vector);

CREATE TABLE IF NOT EXISTS media_intelligence_tags (
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  segment_id text NOT NULL REFERENCES media_intelligence_segments(segment_id) ON DELETE CASCADE,
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
