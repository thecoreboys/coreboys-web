-- Supporter billing controls, price-change audit trail, and Stripe finance
-- actions. The control row is deliberately a singleton so validation is
-- consistent across checkout, account, and the elevated admin desk.

CREATE TABLE IF NOT EXISTS supporter_billing_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  minimum_amount_cents integer NOT NULL DEFAULT 500,
  maximum_amount_cents integer NOT NULL DEFAULT 50000,
  default_amount_cents integer NOT NULL DEFAULT 1000,
  subscriber_notice text,
  notice_effective_at timestamptz,
  notice_published_at timestamptz,
  renewals_disabled_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supporter_billing_controls_limits_check CHECK (
    minimum_amount_cents BETWEEN 500 AND 50000
    AND maximum_amount_cents BETWEEN 500 AND 50000
    AND minimum_amount_cents <= default_amount_cents
    AND default_amount_cents <= maximum_amount_cents
  ),
  CONSTRAINT supporter_billing_controls_notice_check CHECK (
    subscriber_notice IS NULL OR char_length(BTRIM(subscriber_notice)) BETWEEN 10 AND 1000
  )
);

INSERT INTO supporter_billing_controls (singleton, minimum_amount_cents, maximum_amount_cents, default_amount_cents)
VALUES (true, 500, 50000, 1000)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS supporter_billing_price_changes (
  id uuid PRIMARY KEY,
  requested_by uuid,
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 500 AND 50000),
  apply_to_existing boolean NOT NULL DEFAULT false,
  affected_subscriptions integer NOT NULL DEFAULT 0,
  failed_subscriptions integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS stripe_finance_audit (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  stripe_object_type text NOT NULL,
  stripe_object_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_finance_audit_created_idx
  ON stripe_finance_audit (created_at DESC);
