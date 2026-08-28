-- Cross-replica leases for paid public social-media reads. Next's fetch cache
-- is process-local on Azure, so this durable gate prevents three replicas from
-- each spending a credit for the same roster window.

CREATE TABLE IF NOT EXISTS social_fetch_media_refresh_state (
  lane TEXT PRIMARY KEY CHECK (lane IN ('profile_media','instagram_reels')),
  next_refresh_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO social_fetch_media_refresh_state (lane)
VALUES ('profile_media'), ('instagram_reels')
ON CONFLICT (lane) DO NOTHING;
