-- Measured player observations are distinct from older client-supplied counters.
-- No old counters are relabelled as verified playback.
ALTER TABLE fan_watch_time_events
  ADD COLUMN IF NOT EXISTS playback_platform text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS measured boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS fan_watch_measurement_cursors (
  user_id text PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  item_ref text NOT NULL,
  session_id text NOT NULL,
  position_seconds double precision NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL
);

ALTER TABLE fan_watch_measurement_cursors
  ADD COLUMN IF NOT EXISTS remainder_seconds double precision NOT NULL DEFAULT 0;
