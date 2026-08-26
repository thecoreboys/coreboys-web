-- Native FanZone communities, structured participation, moderation, and staff content.
-- Additive/idempotent; no X Community identifiers are stored or invented here.

CREATE TABLE IF NOT EXISTS fanzone_community_memberships (
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  community_key TEXT NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_key)
);
CREATE INDEX IF NOT EXISTS fanzone_community_memberships_key_idx
  ON fanzone_community_memberships (community_key, joined_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_preferences (
  user_id TEXT PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  selected_community TEXT NOT NULL DEFAULT 'core'
    CHECK (selected_community IN ('core','flock','stable','thugs','m3','nms','slg')),
  favorite_communities TEXT[] NOT NULL DEFAULT '{}',
  alert_live BOOLEAN NOT NULL DEFAULT FALSE,
  alert_updates BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fanzone_community_subscriptions (
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  community_key TEXT NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
  alert_live BOOLEAN NOT NULL DEFAULT FALSE,
  alert_updates BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_key)
);

CREATE TABLE IF NOT EXISTS fanzone_community_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_key TEXT NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
  user_id TEXT REFERENCES fan_users(id) ON DELETE SET NULL,
  author_display TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','answered','denied','removed')),
  moderation_note TEXT,
  answer TEXT,
  answered_by TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fanzone_community_questions_public_idx
  ON fanzone_community_questions (community_key, status, created_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_key TEXT NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
  user_id TEXT REFERENCES fan_users(id) ON DELETE SET NULL,
  author_display TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('content','event','site','community','other')),
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  proposal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'under_review'
    CHECK (status IN ('under_review','planned','shipped','declined','removed')),
  moderation_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_state IN ('pending','approved','denied','removed')),
  moderation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fanzone_community_ideas_public_idx
  ON fanzone_community_ideas (community_key, status, created_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_idea_votes (
  idea_id UUID NOT NULL REFERENCES fanzone_community_ideas(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (idea_id, user_id)
);

CREATE TABLE IF NOT EXISTS fanzone_community_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_key TEXT NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
  kind TEXT NOT NULL CHECK (kind IN ('official_update','calendar','showcase')),
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  image_url TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fanzone_community_content_public_idx
  ON fanzone_community_content (community_key, kind, published, published_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_reports (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('question','idea')),
  target_id UUID NOT NULL,
  reporter_user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('privacy','copyright','unsafe','spam','harassment','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_type, target_id, reporter_user_id)
);
CREATE INDEX IF NOT EXISTS fanzone_community_reports_open_idx
  ON fanzone_community_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('question','idea')),
  target_id UUID NOT NULL,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','upheld','denied')),
  response TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_type, target_id, user_id)
);
CREATE INDEX IF NOT EXISTS fanzone_community_appeals_pending_idx
  ON fanzone_community_appeals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_audit (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('question','idea','content','report','appeal')),
  target_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fanzone_community_audit_target_idx
  ON fanzone_community_audit (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fanzone_community_rate_limits (
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  bucket_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action)
);

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS community_key TEXT
    CHECK (community_key IS NULL OR community_key IN ('core','flock','stable','thugs','m3','nms','slg'));
CREATE INDEX IF NOT EXISTS polls_community_key_idx
  ON polls (community_key, created_at DESC);
