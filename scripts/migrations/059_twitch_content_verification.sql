-- One shared lane, with durable candidates surviving the small latest-VOD catalog window.
CREATE TABLE IF NOT EXISTS twitch_content_verification_schedule (
  lane TEXT PRIMARY KEY CHECK (lane='twitch_objects'),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ
);
INSERT INTO twitch_content_verification_schedule(lane) VALUES('twitch_objects') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS twitch_content_verification_checks (
  kind TEXT NOT NULL CHECK (kind IN ('videos','clips')),
  provider_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  last_outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (last_outcome IN ('unknown','found','not_found')),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind,provider_id)
);
CREATE INDEX IF NOT EXISTS twitch_content_verification_checks_due_idx
  ON twitch_content_verification_checks(next_check_at,first_seen_at) WHERE last_outcome<>'not_found';
