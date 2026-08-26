-- Durable social-content ingestion and fan notification delivery.  These
-- tables are additive: platform webhooks can be retried freely and the
-- canonical source identity keeps content events exactly-once for consumers.

CREATE TABLE IF NOT EXISTS social_source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('twitch','youtube','instagram','tiktok','x')),
  member_slug TEXT,
  account_ref TEXT NOT NULL,
  account_label TEXT,
  credential_state TEXT NOT NULL DEFAULT 'unknown',
  webhook_state TEXT NOT NULL DEFAULT 'not_configured',
  last_cursor TEXT,
  last_received_at TIMESTAMPTZ,
  last_reconciled_at TIMESTAMPTZ,
  last_error TEXT,
  next_reconcile_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, account_ref)
);
CREATE INDEX IF NOT EXISTS social_source_registry_health_idx
  ON social_source_registry (provider, enabled, next_reconcile_at);

CREATE TABLE IF NOT EXISTS social_webhook_receipts (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('twitch','youtube','instagram','tiktok')),
  external_event_id TEXT,
  event_type TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  UNIQUE (provider, external_event_id)
);
CREATE INDEX IF NOT EXISTS social_webhook_receipts_pending_idx
  ON social_webhook_receipts (provider, processed_at, received_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS social_content_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('twitch','youtube','instagram','tiktok','x')),
  source_id UUID REFERENCES social_source_registry(id) ON DELETE SET NULL,
  member_slug TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('live','video','short','photo','post')),
  canonical_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT NOT NULL,
  artwork_url TEXT,
  orientation TEXT CHECK (orientation IN ('landscape','portrait','square')),
  platform_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_content_events_recent_idx
  ON social_content_events (published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS social_content_events_member_idx
  ON social_content_events (member_slug, content_type, published_at DESC);

CREATE TABLE IF NOT EXISTS fan_social_notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fan_social_notification_rules (
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  member_slug TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('live','video','short','photo','post')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, member_slug, content_type)
);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx ON web_push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS social_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES social_content_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','push','email')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','read','suppressed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id, channel)
);
CREATE INDEX IF NOT EXISTS social_notification_deliveries_inbox_idx
  ON social_notification_deliveries (user_id, channel, status, created_at DESC);
CREATE INDEX IF NOT EXISTS social_notification_deliveries_pending_idx
  ON social_notification_deliveries (channel, status, available_at, created_at)
  WHERE status IN ('pending','failed','processing');
