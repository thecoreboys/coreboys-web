-- Durable idempotency for admin refunds. Stripe API idempotency keys are not a
-- permanent ledger, so retries reconcile by this operation id and refund
-- metadata before another refund can be created.

CREATE TABLE IF NOT EXISTS stripe_refund_operations (
  operation_id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  payment_intent_id text NOT NULL CHECK (left(payment_intent_id, 3) = 'pi_'),
  requested_amount_cents integer CHECK (requested_amount_cents IS NULL OR requested_amount_cents > 0),
  state text NOT NULL CHECK (state IN ('creating', 'succeeded', 'failed')),
  lease_expires_at timestamptz,
  stripe_refund_id text UNIQUE,
  stripe_refund_amount_cents integer,
  stripe_refund_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'succeeded' AND stripe_refund_id IS NOT NULL AND stripe_refund_amount_cents IS NOT NULL)
    OR state <> 'succeeded'
  )
);

CREATE INDEX IF NOT EXISTS stripe_refund_operations_payment_intent_idx
  ON stripe_refund_operations (payment_intent_id, created_at DESC);
