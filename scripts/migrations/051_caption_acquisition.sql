CREATE TABLE IF NOT EXISTS media_intelligence_caption_acquisition (
  asset_key text PRIMARY KEY REFERENCES media_intelligence_assets(asset_key) ON DELETE CASCADE,
  revision_id text NOT NULL REFERENCES media_intelligence_revisions(revision_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running','imported','unavailable','failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  retry_after timestamptz NOT NULL DEFAULT now() + interval '1 day',
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
