# Stripe Supporter Membership Setup

The app has one optional, self-priced monthly **Supporter** membership. It has
a minimum of $3 USD/month and gives access only to independent account tools.
Public creator content and normal playback are not paid features.

## Stripe configuration

1. In Stripe, enable the **Customer Portal** and permit customers to cancel
   subscriptions and update payment methods.
2. Add a webhook endpoint at:
   `https://YOUR_DOMAIN/api/account/billing/webhook`
3. Subscribe that endpoint to:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Set the following server-only environment variables. Start with Stripe test
   keys and test webhooks; only use live keys after the checkout text, legal
   notices, and independent-status review are approved.

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_MEMBERSHIP_ENABLED=true
STRIPE_MEMBERSHIP_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
```

5. Apply the web migrations before enabling checkout:

```bash
pnpm db:apply-web-migrations
```

6. Verify the live connection without exposing credentials:

```bash
pnpm billing:check --strict
```

The audit verifies that the secret and publishable keys are a matching test or
live pair, reads the Stripe account, and confirms both deployed webhook URLs
are registered. It does not create customers, payments, subscriptions, or
webhook endpoints.

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
`https://YOUR_DOMAIN/api/account/billing/webhook` for the four membership
events listed above. Keep the two webhook signing secrets separate.

## Operational behavior

- Checkout creates a Stripe subscription with dynamic monthly `price_data`.
  The server accepts only whole-cent USD values between $3 and $1,000/month.
- Stripe webhooks, not the browser redirect, update `fan_subscriptions`; this
  is what grants or removes membership tools.
- The billing portal is the only customer-facing place to update payment
  information or cancel. Cancellation preserves access
  until the end of the paid period.
- `STRIPE_MEMBERSHIP_ENABLED` is deliberately separate from postcard payment
  configuration so a Stripe key never accidentally enables recurring charges.
