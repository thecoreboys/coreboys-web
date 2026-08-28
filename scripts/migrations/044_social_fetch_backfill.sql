-- Resumable, admin-started Social Fetch history import. The job owns a second
-- hard credit ceiling in addition to the global provider budget. A durable
-- lease permits only one replica to advance cursors at a time.

CREATE TABLE IF NOT EXISTS social_fetch_backfill_jobs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'cancelled')),
  months INTEGER NOT NULL CHECK (months BETWEEN 1 AND 24),
  cutoff_at TIMESTAMPTZ NOT NULL,
  backfill_before_at TIMESTAMPTZ NOT NULL,
  max_credits INTEGER NOT NULL DEFAULT 1000
    CHECK (max_credits BETWEEN 1 AND 100000),
  credits_committed INTEGER NOT NULL DEFAULT 0
    CHECK (credits_committed >= 0),
  pages_processed INTEGER NOT NULL DEFAULT 0 CHECK (pages_processed >= 0),
  items_recorded INTEGER NOT NULL DEFAULT 0 CHECK (items_recorded >= 0),
  pause_reason TEXT,
  last_error TEXT,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  started_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS social_fetch_backfill_one_active_idx
  ON social_fetch_backfill_jobs ((TRUE))
  WHERE status IN ('running', 'paused');

CREATE INDEX IF NOT EXISTS social_fetch_backfill_jobs_recent_idx
  ON social_fetch_backfill_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS social_fetch_backfill_tasks (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES social_fetch_backfill_jobs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'instagram', 'twitter')),
  surface TEXT NOT NULL CHECK (
    (provider = 'tiktok' AND surface = 'videos')
    OR (provider = 'instagram' AND surface IN ('posts', 'reels'))
    OR (provider = 'twitter' AND surface = 'tweets')
  ),
  handle TEXT NOT NULL,
  member_slug TEXT,
  account_label TEXT NOT NULL,
  cursor TEXT,
  seen_cursors TEXT[] NOT NULL DEFAULT '{}',
  attempt_token UUID,
  attempt_started_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  completion_reason TEXT,
  pages_processed INTEGER NOT NULL DEFAULT 0 CHECK (pages_processed >= 0),
  credits_committed INTEGER NOT NULL DEFAULT 0 CHECK (credits_committed >= 0),
  items_recorded INTEGER NOT NULL DEFAULT 0 CHECK (items_recorded >= 0),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, provider, surface, handle)
);

-- The migration runner is intentionally repeatable. Replace the original
-- TikTok/Instagram-only checks too, so an environment that applied an earlier
-- draft of this migration can accept the additive Twitter task surface.
ALTER TABLE social_fetch_backfill_tasks
  DROP CONSTRAINT IF EXISTS social_fetch_backfill_tasks_provider_check;
ALTER TABLE social_fetch_backfill_tasks
  ADD CONSTRAINT social_fetch_backfill_tasks_provider_check
  CHECK (provider IN ('tiktok', 'instagram', 'twitter'));

ALTER TABLE social_fetch_backfill_tasks
  DROP CONSTRAINT IF EXISTS social_fetch_backfill_tasks_surface_check;
ALTER TABLE social_fetch_backfill_tasks
  ADD CONSTRAINT social_fetch_backfill_tasks_surface_check
  CHECK (
    (provider = 'tiktok' AND surface = 'videos')
    OR (provider = 'instagram' AND surface IN ('posts', 'reels'))
    OR (provider = 'twitter' AND surface = 'tweets')
  );

CREATE INDEX IF NOT EXISTS social_fetch_backfill_tasks_pending_idx
  ON social_fetch_backfill_tasks (job_id, last_attempt_at NULLS FIRST, id)
  WHERE status = 'pending';
