-- Explicit provider removal evidence is service-wide and survives stale imports.
CREATE TABLE IF NOT EXISTS content_tombstones (
  content_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('x','youtube','instagram','tiktok','twitch')),
  reason TEXT NOT NULL CHECK (reason IN ('deleted','private','not_found','admin_removed','rights_revoked')),
  evidence TEXT NOT NULL CHECK (evidence IN ('provider_webhook','provider_lookup','admin_action')),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_tombstones_provider_idx ON content_tombstones(provider, observed_at DESC);

ALTER TABLE social_content_events ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE social_content_events ADD COLUMN IF NOT EXISTS removal_reason TEXT;

-- Read filters take effect immediately. Cross-database/search cleanup retries independently.
CREATE TABLE IF NOT EXISTS content_removal_cleanup (
  id TEXT PRIMARY KEY,
  reference JSONB NOT NULL,
  content_keys TEXT[] NOT NULL,
  related_asset_keys TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_removal_cleanup_pending_idx ON content_removal_cleanup(available_at, created_at) WHERE status <> 'completed';
