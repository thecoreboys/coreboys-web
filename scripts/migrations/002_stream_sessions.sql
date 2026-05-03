-- One row per live stream we observed via Twitch Helix /streams polling.
-- The poller (POST /api/streams/poll, hit by a 5-min DO cron job)
-- opens a row when a member goes live, accumulates peak / sum_viewers /
-- sample_count on every poll while they stay live, and closes the row
-- (sets ended_at + total_minutes) on the first poll where they're
-- offline.
--
-- avg_viewers is computed at read time: sum_viewers / sample_count.

CREATE TABLE IF NOT EXISTS stream_sessions (
  id BIGSERIAL PRIMARY KEY,
  member_slug TEXT NOT NULL,
  twitch_login TEXT NOT NULL,
  -- Twitch stream id; useful for dedupe if a stream is interrupted
  -- briefly and then resumes (we'd otherwise see two sessions).
  twitch_stream_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  peak_viewers INTEGER NOT NULL DEFAULT 0,
  -- Running aggregates so we can compute average without storing every sample.
  sum_viewers BIGINT NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  game TEXT,
  last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A member can have at most one open session at a time. Enforced
  -- with a partial unique index below.
  is_open BOOLEAN GENERATED ALWAYS AS (ended_at IS NULL) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS stream_sessions_open_per_member
  ON stream_sessions (member_slug)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS stream_sessions_member_started_idx
  ON stream_sessions (member_slug, started_at DESC);

CREATE INDEX IF NOT EXISTS stream_sessions_started_idx
  ON stream_sessions (started_at DESC);
