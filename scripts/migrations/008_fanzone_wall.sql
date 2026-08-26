-- Web-repo mirror of coreboys-db/migrations/0012_fanzone_wall.sql.
-- Kept here because this app's legacy operational scripts apply migrations
-- directly from scripts/migrations. All statements are additive/idempotent.

CREATE TABLE IF NOT EXISTS fan_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  thumb_url TEXT,
  caption TEXT,
  submitter_first_name TEXT NOT NULL,
  submitter_last_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  member_slugs TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  denial_reason TEXT,
  approved_at TIMESTAMPTZ,
  reviewed_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fan_submissions
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES fan_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS thumb_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS mime TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS submission_kind TEXT NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS happened_on DATE,
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS photographer_credit TEXT,
  ADD COLUMN IF NOT EXISTS story TEXT,
  ADD COLUMN IF NOT EXISTS image_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS receipt_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS fan_submissions_status_idx ON fan_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS fan_submissions_user_idx ON fan_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fan_submissions_event_idx ON fan_submissions (event_name, happened_on DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS fan_submissions_hash_idx ON fan_submissions (image_sha256) WHERE image_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS fan_photo_reactions (
  submission_id UUID NOT NULL REFERENCES fan_submissions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'core' CHECK (reaction IN ('core')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, user_id)
);
CREATE INDEX IF NOT EXISTS fan_photo_reactions_photo_idx ON fan_photo_reactions (submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fan_photo_reports (
  id BIGSERIAL PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES fan_submissions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  UNIQUE (submission_id, user_id)
);
CREATE INDEX IF NOT EXISTS fan_photo_reports_status_idx ON fan_photo_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS fan_submission_audit (
  id BIGSERIAL PRIMARY KEY,
  submission_id UUID NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fan_submission_audit_submission_idx ON fan_submission_audit (submission_id, created_at DESC);

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS results_visibility TEXT NOT NULL DEFAULT 'after_vote',
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS source_submission_id UUID REFERENCES fan_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winner_option_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE poll_options ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE poll_votes ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 4;
ALTER TABLE poll_votes ADD COLUMN IF NOT EXISTS ranking UUID[];
ALTER TABLE poll_votes ALTER COLUMN weight SET DEFAULT 4;
UPDATE poll_votes SET weight = 4 WHERE weight < 4;

CREATE TABLE IF NOT EXISTS fan_notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (event_type, dedupe_key)
);
CREATE INDEX IF NOT EXISTS fan_notification_outbox_pending_idx ON fan_notification_outbox (status, available_at, created_at) WHERE status IN ('pending','failed','processing');
