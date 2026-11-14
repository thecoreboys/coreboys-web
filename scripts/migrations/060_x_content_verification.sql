-- One service-wide reservation; a crashed/denied attempt cannot spend twice.
CREATE TABLE IF NOT EXISTS x_content_verification_schedule (
  lane TEXT PRIMARY KEY CHECK (lane='stored_posts'),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO x_content_verification_schedule(lane) VALUES('stored_posts') ON CONFLICT DO NOTHING;

-- Retain known IDs after they leave the latest snapshot. Hydrated external
-- quotes share the same ten daily slots with older primary roster posts.
CREATE TABLE IF NOT EXISTS x_content_verification_checks (
  status_id TEXT PRIMARY KEY CHECK (status_id ~ '^[0-9]{5,25}$'),
  priority SMALLINT NOT NULL CHECK (priority IN (0,1)),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (last_outcome IN ('unknown','found','not_found')),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS x_content_verification_checks_due_idx
  ON x_content_verification_checks(next_check_at,last_attempt_at,priority)
  WHERE last_outcome<>'not_found';
