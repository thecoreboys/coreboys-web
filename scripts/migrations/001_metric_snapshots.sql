-- Daily snapshot of a follower / subscriber count for one (member, platform).
-- The cron worker upserts one row per (member_slug, platform, snapshot_date)
-- so reruns within the same UTC day are idempotent.
--
-- `member_slug = '__group__'` is reserved for the CORE group accounts
-- (the four social handles in lib/group.ts). Any other slug is a real
-- member from lib/members.ts.

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id BIGSERIAL PRIMARY KEY,
  member_slug TEXT NOT NULL,
  platform TEXT NOT NULL,
  count BIGINT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_slug, platform, snapshot_date)
);

CREATE INDEX IF NOT EXISTS metric_snapshots_member_platform_idx
  ON metric_snapshots (member_slug, platform, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS metric_snapshots_date_idx
  ON metric_snapshots (snapshot_date DESC);
