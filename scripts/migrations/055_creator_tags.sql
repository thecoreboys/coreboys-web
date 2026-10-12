-- Creator tags use text evidence and editorial placements only. No image/face data.
CREATE TABLE IF NOT EXISTS media_creator_directory (
  creator_id text PRIMARY KEY, profile jsonb NOT NULL, updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS media_creator_annotations (
  id uuid PRIMARY KEY, asset_key text NOT NULL REFERENCES media_intelligence_assets(asset_key) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  creator_id text NOT NULL, start_seconds double precision NOT NULL CHECK (start_seconds >= 0),
  end_seconds double precision NOT NULL CHECK (end_seconds > start_seconds AND end_seconds-start_seconds <= 3600),
  box jsonb, evidence_kind text NOT NULL CHECK (evidence_kind IN ('metadata','caption','visible-text','manual')),
  evidence text NOT NULL, evidence_key text UNIQUE, transcript_id text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','rejected','revoked')),
  submitted_by text NOT NULL, reviewed_by text, created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS media_creator_annotations_asset ON media_creator_annotations(asset_key,revision_id,status,start_seconds);
CREATE INDEX IF NOT EXISTS media_creator_annotations_review ON media_creator_annotations(status,created_at DESC);
CREATE TABLE IF NOT EXISTS media_creator_scans (
  revision_id text PRIMARY KEY REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  input_hash text NOT NULL, scanned_at timestamptz NOT NULL DEFAULT now()
);
