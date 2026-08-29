-- Upgrade already-created supporter billing controls from the original fixed
-- $3/$500 row to configurable controls inside the $5-$500 safety rails.

ALTER TABLE supporter_billing_controls
  ADD COLUMN IF NOT EXISTS subscriber_notice text,
  ADD COLUMN IF NOT EXISTS notice_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS notice_published_at timestamptz;

ALTER TABLE supporter_billing_controls
  DROP CONSTRAINT IF EXISTS supporter_billing_controls_minimum_amount_cents_check,
  DROP CONSTRAINT IF EXISTS supporter_billing_controls_maximum_amount_cents_check,
  DROP CONSTRAINT IF EXISTS supporter_billing_controls_default_amount_cents_check,
  DROP CONSTRAINT IF EXISTS supporter_billing_controls_limits_check,
  DROP CONSTRAINT IF EXISTS supporter_billing_controls_notice_check;

ALTER TABLE supporter_billing_controls
  ALTER COLUMN minimum_amount_cents SET DEFAULT 500,
  ALTER COLUMN maximum_amount_cents SET DEFAULT 50000,
  ALTER COLUMN default_amount_cents SET DEFAULT 1000;

UPDATE supporter_billing_controls
   SET minimum_amount_cents = GREATEST(500, LEAST(minimum_amount_cents, 50000)),
       maximum_amount_cents = GREATEST(500, LEAST(maximum_amount_cents, 50000)),
       updated_at = now()
 WHERE minimum_amount_cents NOT BETWEEN 500 AND 50000
    OR maximum_amount_cents NOT BETWEEN 500 AND 50000;

UPDATE supporter_billing_controls
   SET maximum_amount_cents = GREATEST(minimum_amount_cents, maximum_amount_cents),
       default_amount_cents = GREATEST(
         minimum_amount_cents,
         LEAST(default_amount_cents, GREATEST(minimum_amount_cents, maximum_amount_cents))
       ),
       updated_at = now()
 WHERE maximum_amount_cents < minimum_amount_cents
    OR default_amount_cents < minimum_amount_cents
    OR default_amount_cents > maximum_amount_cents;

ALTER TABLE supporter_billing_controls
  ADD CONSTRAINT supporter_billing_controls_limits_check CHECK (
    minimum_amount_cents BETWEEN 500 AND 50000
    AND maximum_amount_cents BETWEEN 500 AND 50000
    AND minimum_amount_cents <= default_amount_cents
    AND default_amount_cents <= maximum_amount_cents
  ),
  ADD CONSTRAINT supporter_billing_controls_notice_check CHECK (
    subscriber_notice IS NULL OR char_length(BTRIM(subscriber_notice)) BETWEEN 10 AND 1000
  );

ALTER TABLE supporter_billing_price_changes
  DROP CONSTRAINT IF EXISTS supporter_billing_price_changes_amount_cents_check;

ALTER TABLE supporter_billing_price_changes
  ADD CONSTRAINT supporter_billing_price_changes_amount_cents_check
  CHECK (amount_cents BETWEEN 500 AND 50000) NOT VALID;
