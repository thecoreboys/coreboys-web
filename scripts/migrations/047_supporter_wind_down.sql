-- Durable supporter wind-down switch. This closes the race where a Checkout
-- opened before an admin shutdown could complete after the point-in-time
-- subscription scan and otherwise continue renewing.

ALTER TABLE supporter_billing_controls
  ADD COLUMN IF NOT EXISTS renewals_disabled_at timestamptz;
