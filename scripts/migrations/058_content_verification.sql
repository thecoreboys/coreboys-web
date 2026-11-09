-- Budgeted object checks are scheduled once for the entire service, not per fan.
CREATE TABLE IF NOT EXISTS content_verification_schedule (
  lane TEXT PRIMARY KEY CHECK (lane='social_objects'),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ
);
INSERT INTO content_verification_schedule(lane) VALUES('social_objects') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS content_verification_checks (
  canonical_id TEXT PRIMARY KEY REFERENCES social_content_events(canonical_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram','tiktok')),
  last_checked_at TIMESTAMPTZ,
  last_outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (last_outcome IN ('unknown','found','not_found','invalid')),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_verification_checks_due_idx
  ON content_verification_checks(next_check_at) WHERE last_outcome<>'not_found';
