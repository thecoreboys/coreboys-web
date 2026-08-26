# Local subscription foundation

The subscription layer is a local product-development foundation. It does not
create a checkout, call Stripe, charge a card, deploy billing, or restrict
access to public creator content. The existing Stripe client remains isolated
to the postcard flow.

## Apply the additive schema

Run `pnpm db:apply-web-migrations` against the local development database. Until
`016_subscription_entitlements.sql` is applied, authenticated accounts resolve
safely to Free with `storageState: "migration_required"`.

## Simulate a plan locally

Plan simulation is non-persistent and intentionally requires every guard below:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56222/coreboys
SUBSCRIPTION_DEV_OVERRIDE_ENABLED=true
SUBSCRIPTION_DEV_OVERRIDE_ACK=LOCAL_ONLY_NO_BILLING
SUBSCRIPTION_DEV_OVERRIDE_USER_ID=<the exact signed-in fan_users.id>
SUBSCRIPTION_DEV_OVERRIDE_PLAN=pro
```

The request hostname and database hostname must both be loopback addresses, the
target cannot be a wildcard, and common deployment runtime markers disable the
override. The override is never written to PostgreSQL.

## Server contract

`GET /api/account/subscription` is authenticated and read-only. It returns the
effective account plan, allowed and denied feature IDs, metered limits and
usage, active add-on/lifetime records, planning catalog, disabled-billing state,
and independent-software disclosures. Responses are private and non-cacheable.

Premium server routes must call `requireAccountEntitlement`. Metered operations
must call `consumeAccountMeter`, which performs an atomic database limit check.
Client-side lock states are explanatory UI only and are never authoritative.

The following capabilities are explicit Free-plan invariants: public/live/embed
playback, standard playback controls, catalog and Guide browsing, basic search,
one basic list, accessibility controls, privacy and account security controls,
and account data export/deletion.
