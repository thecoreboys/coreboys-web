-- Hourly aggregation of Twitch chat activity per member, written by
-- the chat-listener worker (workers/chat-listener). The worker holds
-- counts in memory and flushes them every 60s using the conflict
-- target below, so the row for the current hour gets continuously
-- updated until the hour rolls over.

CREATE TABLE IF NOT EXISTS chat_metrics (
  id BIGSERIAL PRIMARY KEY,
  member_slug TEXT NOT NULL,
  twitch_login TEXT NOT NULL,
  -- Hour bucket truncated to the start of the hour (UTC).
  hour_utc TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  unique_chatters INTEGER NOT NULL DEFAULT 0,
  last_flushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_slug, hour_utc)
);

CREATE INDEX IF NOT EXISTS chat_metrics_member_hour_idx
  ON chat_metrics (member_slug, hour_utc DESC);

CREATE INDEX IF NOT EXISTS chat_metrics_hour_idx
  ON chat_metrics (hour_utc DESC);
