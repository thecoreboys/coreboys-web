-- Security hardening: TOTP for elevated staff accounts, durable login
-- throttling, and provider-level AI spend controls. All objects are additive
-- and idempotent so this can run against the existing production schema.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS totp_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS totp_last_used_step bigint,
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

UPDATE admin_users
   SET session_version = GREATEST(COALESCE(session_version, 1), 1),
       totp_enabled = COALESCE(totp_enabled, false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'admin_users'::regclass
       AND conname = 'admin_users_totp_secret_check'
  ) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_totp_secret_check
      CHECK (
        (totp_enabled = false AND totp_secret_ciphertext IS NULL)
        OR (totp_enabled = true AND totp_secret_ciphertext IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_totp_challenges (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('enroll', 'verify')),
  secret_ciphertext text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_totp_challenges_active_idx
  ON admin_totp_challenges (admin_user_id, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_auth_rate_limits (
  subject_key text NOT NULL,
  bucket_started_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (subject_key)
);

CREATE TABLE IF NOT EXISTS ai_provider_controls (
  provider text PRIMARY KEY CHECK (provider IN ('anthropic', 'elevenlabs')),
  enabled boolean NOT NULL DEFAULT false,
  daily_request_limit integer NOT NULL DEFAULT 0 CHECK (daily_request_limit >= 0),
  per_subject_hour_limit integer NOT NULL DEFAULT 0 CHECK (per_subject_hour_limit >= 0),
  monthly_budget_cents integer NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Conservative defaults: Anthropic remains available but has a finite global
-- and per-visitor cap. ElevenLabs remains disabled because the app serves
-- approved static audio rather than generating speech for listeners.
INSERT INTO ai_provider_controls
  (provider, enabled, daily_request_limit, per_subject_hour_limit, monthly_budget_cents)
VALUES
  ('anthropic', true, 300, 20, 2500),
  ('elevenlabs', false, 0, 0, 0)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY,
  provider text NOT NULL REFERENCES ai_provider_controls(provider),
  feature text NOT NULL,
  model text NOT NULL,
  subject_key text,
  estimated_input_tokens integer NOT NULL DEFAULT 0 CHECK (estimated_input_tokens >= 0),
  reserved_output_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_output_tokens >= 0),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
  actual_cost_microusd bigint,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_usage_events_provider_time_idx
  ON ai_usage_events (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_subject_time_idx
  ON ai_usage_events (provider, subject_key, created_at DESC)
  WHERE subject_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_provider_control_audit (
  id bigserial PRIMARY KEY,
  provider text NOT NULL REFERENCES ai_provider_controls(provider),
  actor_id uuid,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
