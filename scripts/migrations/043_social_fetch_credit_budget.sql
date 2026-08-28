-- Durable Social Fetch credit controls. Every paid provider request reserves
-- against this ledger while holding the singleton control row, so concurrent
-- Azure replicas cannot collectively cross the configured monthly cap.

CREATE TABLE IF NOT EXISTS social_fetch_provider_control (
  provider TEXT PRIMARY KEY CHECK (provider = 'social_fetch'),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_credit_cap INTEGER NOT NULL DEFAULT 10000
    CHECK (monthly_credit_cap BETWEEN 0 AND 1000000),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO social_fetch_provider_control (provider, enabled, monthly_credit_cap)
VALUES ('social_fetch', TRUE, 10000)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS social_fetch_credit_events (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'social_fetch'
    REFERENCES social_fetch_provider_control(provider),
  feature TEXT NOT NULL,
  request_key TEXT NOT NULL,
  estimated_credits INTEGER NOT NULL CHECK (estimated_credits > 0),
  actual_credits INTEGER CHECK (actual_credits >= 0),
  provider_reported BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS social_fetch_credit_events_month_idx
  ON social_fetch_credit_events (created_at DESC)
  WHERE status IN ('reserved', 'completed');

CREATE INDEX IF NOT EXISTS social_fetch_credit_events_feature_month_idx
  ON social_fetch_credit_events (feature, created_at DESC)
  WHERE status IN ('reserved', 'completed');

CREATE TABLE IF NOT EXISTS social_fetch_provider_control_audit (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'social_fetch'
    REFERENCES social_fetch_provider_control(provider),
  actor_id UUID,
  before JSONB NOT NULL,
  after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
