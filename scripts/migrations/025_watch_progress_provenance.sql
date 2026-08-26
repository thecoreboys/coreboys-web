-- Watch progress provenance. Manual completion changes resume/progress UI but
-- never writes watch-time evidence or rewards.

ALTER TABLE fan_watch_progress
  ADD COLUMN IF NOT EXISTS completion_source TEXT
    CHECK (completion_source IS NULL OR completion_source IN ('playback', 'manual', 'provider'));

CREATE TABLE IF NOT EXISTS fan_watch_time_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  item_ref     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('site', 'provider')),
  provider     TEXT,
  seconds      INTEGER NOT NULL CHECK (seconds BETWEEN 1 AND 180),
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((source = 'site' AND provider IS NULL) OR (source = 'provider' AND provider IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS fan_watch_time_events_user_time_idx
  ON fan_watch_time_events (user_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS fan_watch_time_events_item_idx
  ON fan_watch_time_events (user_id, item_ref, observed_at DESC);

COMMENT ON COLUMN fan_watch_progress.completion_source IS
  'playback = completed through measured playback; manual = user marked watched with zero watch-time credit; provider = imported only from auditable provider evidence.';
