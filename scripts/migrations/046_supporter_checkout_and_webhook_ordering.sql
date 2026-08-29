-- Serialize supporter Checkout creation per account and make Stripe webhook
-- projection monotonic. Stripe can deliver events more than once and out of
-- order, so the local entitlement row records the provider event cursor.

ALTER TABLE fan_subscriptions
  ADD COLUMN IF NOT EXISTS provider_event_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_event_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_event_id text;

CREATE TABLE IF NOT EXISTS supporter_checkout_attempts (
  user_id text PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 500 AND 50000),
  state text NOT NULL CHECK (state IN ('creating', 'open', 'completed', 'expired', 'failed')),
  stripe_session_id text UNIQUE,
  stripe_session_url text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supporter_checkout_attempts_session_check CHECK (
    (state = 'open' AND stripe_session_id IS NOT NULL AND stripe_session_url IS NOT NULL)
    OR state <> 'open'
  ),
  CONSTRAINT supporter_checkout_attempts_url_check CHECK (
    stripe_session_url IS NULL OR stripe_session_url LIKE 'https://checkout.stripe.com/%'
  )
);

CREATE INDEX IF NOT EXISTS supporter_checkout_attempts_expiry_idx
  ON supporter_checkout_attempts (expires_at)
  WHERE state IN ('creating', 'open');
