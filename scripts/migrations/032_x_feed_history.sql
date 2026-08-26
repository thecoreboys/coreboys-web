-- Keep a single, auditable marker that the official X full-archive backfill
-- succeeded. The normal five-minute recent-search job then maintains the
-- six-month rolling snapshot without repeating costly historical requests.
ALTER TABLE x_feed_snapshots
  ADD COLUMN IF NOT EXISTS history_backfilled_at TIMESTAMPTZ;
