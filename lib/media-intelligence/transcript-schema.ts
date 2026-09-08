export const TRANSCRIPT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS media_intelligence_transcript_imports (
  import_id text PRIMARY KEY,
  asset_key text NOT NULL REFERENCES media_intelligence_assets(asset_key) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  language text NOT NULL,
  cues jsonb NOT NULL,
  rights_reference text NOT NULL,
  submitted_by text NOT NULL,
  reviewed_by text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','revoked','superseded')),
  run_id text REFERENCES media_intelligence_analysis_runs(run_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (revision_id, content_hash, language)
);
CREATE INDEX IF NOT EXISTS media_transcripts_review ON media_intelligence_transcript_imports(status, created_at);
CREATE INDEX IF NOT EXISTS media_transcripts_search ON media_intelligence_transcript_imports(run_id, status, expires_at);
`;
