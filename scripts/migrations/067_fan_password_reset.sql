-- Bumping the version revokes every existing fan session after a reset.
-- Version zero preserves signed sessions issued before this migration.
ALTER TABLE fan_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS fan_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fan_password_reset_tokens_user_idx
  ON fan_password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fan_password_reset_tokens_pending_idx
  ON fan_password_reset_tokens (expires_at) WHERE consumed_at IS NULL;
