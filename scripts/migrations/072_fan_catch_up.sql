-- Catch up: what a signed-in fan missed since they last caught up.
-- Additive only. lib/catch-up-server.ts creates the same objects lazily and
-- degrades to a read-only view if they are missing, so deploying the code
-- before this migration is safe.

CREATE TABLE IF NOT EXISTS fan_catch_up_state (
  user_id TEXT PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  -- Everything published at or before this instant has been caught up on.
  seen_through TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual items marked seen (or opened) ahead of a full "mark all seen".
CREATE TABLE IF NOT EXISTS fan_catch_up_seen (
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS fan_catch_up_seen_age_idx
  ON fan_catch_up_seen (seen_at);

-- Channel "Most watched on CORE" rankings aggregate measured watch time per item.
CREATE INDEX IF NOT EXISTS fan_watch_time_events_item_time_idx
  ON fan_watch_time_events (item_ref, observed_at DESC)
  WHERE source = 'site' AND measured = true;
