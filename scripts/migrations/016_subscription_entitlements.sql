-- Independent software subscription and entitlement foundation.
--
-- This migration stores product-plan state only. It creates no checkout,
-- charges no account, grants no access to third-party content, and contains no
-- creator-branded product names. Public playback remains free in application
-- policy regardless of these rows.

CREATE TABLE IF NOT EXISTS fan_subscriptions (
  user_id               text PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  plan_id               text NOT NULL DEFAULT 'free',
  status                text NOT NULL DEFAULT 'active',
  source                text NOT NULL DEFAULT 'manual_local',
  billing_interval      text NOT NULL DEFAULT 'none',
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  trial_ends_at          timestamptz,
  cancel_at_period_end  boolean NOT NULL DEFAULT false,
  external_customer_ref text,
  external_plan_ref     text,
  external_contract_ref text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fan_subscriptions_plan_check
    CHECK (plan_id IN ('free', 'plus', 'pro', 'business')),
  CONSTRAINT fan_subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'paused', 'canceled', 'expired', 'incomplete')),
  CONSTRAINT fan_subscriptions_source_check
    CHECK (source IN ('manual_local', 'future_billing', 'support', 'migration')),
  CONSTRAINT fan_subscriptions_interval_check
    CHECK (billing_interval IN ('none', 'month', 'year', 'lifetime')),
  CONSTRAINT fan_subscriptions_period_check
    CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start),
  CONSTRAINT fan_subscriptions_trial_check
    CHECK (trial_ends_at IS NULL OR status = 'trialing')
);

CREATE INDEX IF NOT EXISTS fan_subscriptions_status_idx
  ON fan_subscriptions (status, plan_id);

CREATE TABLE IF NOT EXISTS fan_subscription_addons (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  addon_id    text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  quantity    integer NOT NULL DEFAULT 1,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  source      text NOT NULL DEFAULT 'manual_local',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fan_subscription_addons_id_check
    CHECK (addon_id IN ('semantic_search_pack_100', 'automation_pack_1000', 'cloud_storage_pack_25gb')),
  CONSTRAINT fan_subscription_addons_status_check
    CHECK (status IN ('active', 'expired', 'revoked')),
  CONSTRAINT fan_subscription_addons_quantity_check CHECK (quantity > 0 AND quantity <= 1000),
  CONSTRAINT fan_subscription_addons_window_check CHECK (expires_at IS NULL OR expires_at > starts_at),
  CONSTRAINT fan_subscription_addons_source_check
    CHECK (source IN ('manual_local', 'future_billing', 'support', 'migration'))
);

CREATE INDEX IF NOT EXISTS fan_subscription_addons_user_idx
  ON fan_subscription_addons (user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS fan_lifetime_entitlements (
  user_id     text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  sku         text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  source      text NOT NULL DEFAULT 'manual_local',
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sku),
  CONSTRAINT fan_lifetime_entitlements_sku_check CHECK (sku IN ('local_pro_lifetime')),
  CONSTRAINT fan_lifetime_entitlements_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT fan_lifetime_entitlements_source_check
    CHECK (source IN ('manual_local', 'future_billing', 'support', 'migration')),
  CONSTRAINT fan_lifetime_entitlements_revocation_check
    CHECK ((status = 'active' AND revoked_at IS NULL) OR status = 'revoked')
);

CREATE TABLE IF NOT EXISTS fan_entitlement_usage (
  user_id     text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  meter_id    text NOT NULL,
  period_key  text NOT NULL,
  used        bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, meter_id, period_key),
  CONSTRAINT fan_entitlement_usage_meter_check
    CHECK (meter_id IN ('semantic_queries_monthly', 'automation_runs_monthly', 'cloud_storage_mb', 'additional_profiles')),
  CONSTRAINT fan_entitlement_usage_period_check
    CHECK (period_key = 'lifetime' OR period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT fan_entitlement_usage_nonnegative_check CHECK (used >= 0)
);

-- Immutable audit events make future billing-provider reconciliation possible
-- without making a provider part of today's local foundation.
CREATE TABLE IF NOT EXISTS fan_subscription_events (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  actor_type  text NOT NULL DEFAULT 'system',
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fan_subscription_events_actor_check
    CHECK (actor_type IN ('system', 'account', 'admin', 'future_provider')),
  CONSTRAINT fan_subscription_events_payload_check
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS fan_subscription_events_user_idx
  ON fan_subscription_events (user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_fan_subscription_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fan_subscription_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS fan_subscription_events_immutable ON fan_subscription_events;
CREATE TRIGGER fan_subscription_events_immutable
BEFORE UPDATE OR DELETE ON fan_subscription_events
FOR EACH ROW EXECUTE FUNCTION prevent_fan_subscription_event_mutation();
