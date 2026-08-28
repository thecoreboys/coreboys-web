-- One-time, hashed email verification links for fan accounts. Raw tokens are
-- sent to the account address and never stored in the database.

CREATE TABLE IF NOT EXISTS fan_email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fan_email_verification_tokens_user_idx
  ON fan_email_verification_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fan_email_verification_tokens_pending_idx
  ON fan_email_verification_tokens (expires_at)
  WHERE consumed_at IS NULL;
