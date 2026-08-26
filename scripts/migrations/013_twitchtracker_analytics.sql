-- Durable rolling 30-day summaries from TwitchTracker's documented basic API.
-- These are daily observations of overlapping rolling windows, not exact
-- per-day stream totals. Raw payloads are retained because the upstream API is
-- unversioned and may add fields over time.

CREATE TABLE IF NOT EXISTS twitchtracker_channel_snapshots (
  id BIGSERIAL PRIMARY KEY,
  member_slug TEXT NOT NULL,
  twitch_login TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  window_days SMALLINT NOT NULL DEFAULT 30,
  rank INTEGER,
  minutes_streamed INTEGER NOT NULL,
  avg_viewers INTEGER NOT NULL,
  max_viewers INTEGER NOT NULL,
  hours_watched BIGINT NOT NULL,
  followers_gained INTEGER NOT NULL,
  followers_total BIGINT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL,
  CONSTRAINT twitchtracker_channel_window_positive CHECK (window_days > 0),
  CONSTRAINT twitchtracker_channel_rank_nonnegative CHECK (rank IS NULL OR rank >= 0),
  CONSTRAINT twitchtracker_channel_minutes_nonnegative CHECK (minutes_streamed >= 0),
  CONSTRAINT twitchtracker_channel_avg_nonnegative CHECK (avg_viewers >= 0),
  CONSTRAINT twitchtracker_channel_max_nonnegative CHECK (max_viewers >= 0),
  CONSTRAINT twitchtracker_channel_watch_nonnegative CHECK (hours_watched >= 0),
  CONSTRAINT twitchtracker_channel_followers_total_nonnegative CHECK (followers_total >= 0),
  CONSTRAINT twitchtracker_channel_daily_unique UNIQUE (twitch_login, snapshot_date)
);

CREATE INDEX IF NOT EXISTS twitchtracker_channel_member_date_idx
  ON twitchtracker_channel_snapshots (member_slug, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS twitchtracker_channel_date_idx
  ON twitchtracker_channel_snapshots (snapshot_date DESC);

-- Game/category summaries describe Twitch as a whole. They must never be
-- presented as the named member's personal category performance.
CREATE TABLE IF NOT EXISTS twitchtracker_game_snapshots (
  id BIGSERIAL PRIMARY KEY,
  lookup_key TEXT NOT NULL,
  game_name TEXT,
  snapshot_date DATE NOT NULL,
  window_days SMALLINT NOT NULL DEFAULT 30,
  rank INTEGER,
  avg_viewers INTEGER NOT NULL,
  avg_channels DOUBLE PRECISION NOT NULL,
  hours_watched BIGINT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL,
  CONSTRAINT twitchtracker_game_window_positive CHECK (window_days > 0),
  CONSTRAINT twitchtracker_game_rank_nonnegative CHECK (rank IS NULL OR rank >= 0),
  CONSTRAINT twitchtracker_game_avg_nonnegative CHECK (avg_viewers >= 0),
  CONSTRAINT twitchtracker_game_channels_nonnegative CHECK (avg_channels >= 0),
  CONSTRAINT twitchtracker_game_watch_nonnegative CHECK (hours_watched >= 0),
  CONSTRAINT twitchtracker_game_daily_unique UNIQUE (lookup_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS twitchtracker_game_lookup_date_idx
  ON twitchtracker_game_snapshots (lookup_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS twitchtracker_game_date_idx
  ON twitchtracker_game_snapshots (snapshot_date DESC);
