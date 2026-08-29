# Stripe Supporter Membership Setup

The app has one optional, self-priced monthly **Supporter** membership. It has
a minimum of $5 USD/month and gives access only to independent account tools.
Public creator content and normal playback are not paid features.

## Stripe configuration

1. In Stripe, enable the default **Customer Portal** configuration and permit
   customers to cancel subscriptions **at the end of the billing period** and
   update payment methods. Disable
   Portal subscription/plan updates; custom supporter amounts must stay inside
   the app's server-validated range.
2. In Stripe **Public details**, set the Terms URL to
   `https://thecoreboys.com/legal/terms`. Checkout requires its Terms checkbox,
   so a missing URL makes session creation fail closed.
3. Add a webhook endpoint at:
   `https://YOUR_DOMAIN/api/account/billing/webhook`
4. Subscribe that endpoint to:
   `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`,
   `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Set the following server-only environment variables. Start with Stripe test
   keys and test webhooks; only use live keys after the checkout text, legal
   notices, and independent-status review are approved.

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_MEMBERSHIP_ENABLED=true
STRIPE_MEMBERSHIP_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
```

6. Apply the web migrations before enabling checkout:

```bash
pnpm db:apply-web-migrations
```

7. Verify the membership connection without exposing credentials:

```bash
pnpm billing:check --membership-only --strict
```

The audit verifies that the secret and publishable keys are a matching test or
live pair, charges are enabled, the public HTTPS origin and Terms URL match,
the default Customer Portal permits period-end cancellation/payment-method updates while
blocking plan switching, and the deployed membership webhook is enabled with
every required event (plus the postcard webhook when that product is
configured). It does not create customers, payments, subscriptions, or webhook
endpoints. Stripe's API does not reveal an endpoint's signing secret, so this
audit cannot prove that `STRIPE_MEMBERSHIP_WEBHOOK_SECRET` belongs to the listed
endpoint.

8. Before enabling live checkout, complete this test-mode acceptance check on a
   deployed test environment:
   - In the Stripe Dashboard, send a test event to the membership endpoint and
     confirm a successful 2xx delivery. A signature error means the deployed
     signing secret does not match the endpoint.
   - With a dedicated test user, complete one $10 monthly Checkout using a Stripe
     test card. Confirm the Dashboard deliveries succeed and the account shows
     the membership, amount, invoice, and receipt.
   - Change the next renewal amount in Billing and confirm Stripe records no
     immediate charge or proration. Then use the Customer Portal to cancel and
     confirm both Stripe and the app show cancellation at the end of the paid
     period while access remains available for that period.
   - Record the test user, Stripe customer/subscription IDs, delivery IDs, UTC
     time, and result in the release evidence. Do not enable live mode until all
     checks pass.

For Azure production deploys, set the GitHub Actions repository variables
`STRIPE_MEMBERSHIP_OPERATIONS_REQUIRED=true` and
`STRIPE_MEMBERSHIP_ENABLED=true` only after the readiness audit passes. The
workflow refuses to enable checkout unless both are true. A missing variable
resolves to `false`, and the workflow writes the fail-closed checkout value to
every new Container Apps revision. Keep the operations-required variable true
through any wind-down and the final paid period. Disabled revisions with that
flag still run an operations-only readiness check so the customer portal and
signed webhook remain healthy. The flag may be false only before memberships
have ever launched or after every paid term and billing obligation has ended.

## Postcard payments

Postcards use the same Stripe account, but require the matching print-provider
configuration before a charge can be accepted:

```env
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
LOB_API_KEY=live_...
```

Register `https://YOUR_DOMAIN/api/postcard/webhook` for
`payment_intent.succeeded`. Register
`https://YOUR_DOMAIN/api/account/billing/webhook` for the five membership
events listed above. Keep the two webhook signing secrets separate.

## Operational behavior

- Checkout creates a Stripe subscription with dynamic monthly `price_data`.
  The server accepts only whole-cent USD values inside the configured $5–$500/month safety rails.
- Stripe webhooks, not the browser redirect, update `fan_subscriptions`; this
  is what grants or removes membership tools.
- The billing portal updates payment information and handles cancellation. The
  in-app billing area also lets a subscriber affirmatively choose a new renewal
  amount without an immediate charge or proration.
- Restrictive range changes publish a billing-area notice with a deadline at
  least 30 days away. Out-of-range cancellations cannot be scheduled until the
  published deadline has passed, and they take effect only after the paid term.
- `STRIPE_MEMBERSHIP_ENABLED` is deliberately separate from postcard payment
  configuration so a Stripe key never accidentally enables recurring charges.
  Turning it off pauses only new checkout; existing portal access and signed
  webhook reconciliation remain available while the keys and webhook secret stay configured.

## Service wind-down

Before taking the paid service offline:

1. In **Admin > Billing**, use **Stop all future supporter renewals**. The
   durable wind-down flag blocks new checkout before the scan begins, schedules
   every active or recovering supporter contract to end after its current paid
   period, and writes internal audit records. Re-run the scan if it reports any
   failures.
2. Set `STRIPE_MEMBERSHIP_ENABLED=false` as a second checkout safeguard. Keep
   `STRIPE_MEMBERSHIP_OPERATIONS_REQUIRED=true`, and keep the Stripe keys and
   membership webhook secret configured.
3. Verify in Stripe that no supporter subscription remains set to renew. Keep
   the customer portal, webhook endpoint, and paid service available through
   the final paid period, and address refunds or mandatory notices as required.
