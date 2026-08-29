import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  DEFAULT_SUPPORTER_BILLING_CONTROLS,
  MEMBERSHIP_DEFAULT_CENTS,
  MEMBERSHIP_MAXIMUM_CENTS,
  MEMBERSHIP_MINIMUM_CENTS,
  supporterAmountAllowed,
  validSupporterBillingControls,
} from "../lib/subscriptions/billing-policy";
import {
  billingAnalyticsDateKeys,
  buildDailyFinanceSeries,
  buildDailySubscriptionSeries,
} from "../lib/supporter-billing-analytics";
import { stripePublishableKeyMode, stripeSecretKeyMode } from "../lib/stripe";

test("Stripe key roles prevent a secret key from entering the public browser slot", () => {
  assert.equal(stripeSecretKeyMode("sk_test_server"), "test");
  assert.equal(stripeSecretKeyMode("sk_live_server"), "live");
  assert.equal(stripeSecretKeyMode("pk_live_public"), "invalid");
  assert.equal(stripePublishableKeyMode("pk_test_public"), "test");
  assert.equal(stripePublishableKeyMode("pk_live_public"), "live");
  assert.equal(stripePublishableKeyMode("sk_live_server"), "invalid");
});

test("supporter policy defaults to $10 inside configurable $5-$500 safety rails", () => {
  assert.equal(MEMBERSHIP_MINIMUM_CENTS, 500);
  assert.equal(MEMBERSHIP_MAXIMUM_CENTS, 50_000);
  assert.equal(MEMBERSHIP_DEFAULT_CENTS, 1_000);
  assert.equal(DEFAULT_SUPPORTER_BILLING_CONTROLS.defaultAmountCents, 1_000);
  assert.equal(supporterAmountAllowed(499, DEFAULT_SUPPORTER_BILLING_CONTROLS), false);
  assert.equal(supporterAmountAllowed(500, DEFAULT_SUPPORTER_BILLING_CONTROLS), true);
  assert.equal(supporterAmountAllowed(1_000, DEFAULT_SUPPORTER_BILLING_CONTROLS), true);
  assert.equal(supporterAmountAllowed(50_000, DEFAULT_SUPPORTER_BILLING_CONTROLS), true);
  assert.equal(supporterAmountAllowed(50_001, DEFAULT_SUPPORTER_BILLING_CONTROLS), false);
});

test("admin controls can narrow but never escape the safety rails", () => {
  assert.equal(validSupporterBillingControls({ minimumAmountCents: 1_000, defaultAmountCents: 2_500, maximumAmountCents: 20_000 }), true);
  assert.equal(validSupporterBillingControls({ minimumAmountCents: 499, defaultAmountCents: 1_000, maximumAmountCents: 20_000 }), false);
  assert.equal(validSupporterBillingControls({ minimumAmountCents: 1_000, defaultAmountCents: 999, maximumAmountCents: 20_000 }), false);
  assert.equal(validSupporterBillingControls({ minimumAmountCents: 1_000, defaultAmountCents: 20_001, maximumAmountCents: 20_000 }), false);
  assert.equal(validSupporterBillingControls({ minimumAmountCents: 1_000, defaultAmountCents: 20_000, maximumAmountCents: 50_001 }), false);
});

test("finance analytics produce exactly 30 UTC days and retain negative refund math", () => {
  const now = new Date("2026-08-28T18:00:00.000Z");
  const series = buildDailyFinanceSeries([
    { created: Date.parse("2026-08-28T01:00:00Z") / 1000, type: "charge", amount: 1_000, fee: 59, net: 941, currency: "usd" },
    { created: Date.parse("2026-08-28T02:00:00Z") / 1000, type: "refund", amount: -500, fee: -15, net: -485, currency: "usd" },
    { created: Date.parse("2026-08-28T02:30:00Z") / 1000, type: "payment", reportingCategory: "charge", amount: 200, fee: 10, net: 190, currency: "usd" },
    { created: Date.parse("2026-08-28T02:45:00Z") / 1000, type: "payment_refund", reportingCategory: "refund", amount: -100, fee: 0, net: -100, currency: "usd" },
    { created: Date.parse("2026-08-28T03:00:00Z") / 1000, type: "payout", amount: -456, fee: 0, net: -456, currency: "usd" },
    { created: Date.parse("2026-08-28T04:00:00Z") / 1000, type: "charge", amount: 700, fee: 30, net: 670, currency: "eur" },
  ], now);
  assert.equal(series.length, 30);
  assert.deepEqual(billingAnalyticsDateKeys(now).at(-1), "2026-08-28");
  assert.deepEqual(series.at(-1), { date: "2026-08-28", grossCents: 1_200, feesCents: 54, refundsCents: 600, netCents: 546 });
  assert.equal(series.slice(0, -1).every((point) => point.grossCents === 0 && point.netCents === 0), true);
});

test("subscription analytics zero-fill days and reconstruct day-end active counts", () => {
  const now = new Date("2026-08-28T18:00:00.000Z");
  const series = buildDailySubscriptionSeries([
    { created: Date.parse("2026-08-27T02:00:00Z") / 1000, kind: "started" },
    { created: Date.parse("2026-08-28T02:00:00Z") / 1000, kind: "canceled" },
  ], 5, now);
  assert.equal(series.length, 30);
  assert.deepEqual(series.at(-2), { date: "2026-08-27", active: 6, started: 1, canceled: 0 });
  assert.deepEqual(series.at(-1), { date: "2026-08-28", active: 5, started: 0, canceled: 1 });
});

test("checkout, admin, account, migration, and Terms preserve billing safeguards", () => {
  const checkout = readFileSync(resolve(process.cwd(), "app/api/account/billing/checkout/route.ts"), "utf8");
  const admin = readFileSync(resolve(process.cwd(), "lib/supporter-billing-admin.ts"), "utf8");
  const accountAmount = readFileSync(resolve(process.cwd(), "app/api/account/billing/amount/route.ts"), "utf8");
  const migration = readFileSync(resolve(process.cwd(), "scripts/migrations/045_supporter_billing_guardrails.sql"), "utf8");
  const refundMigration = readFileSync(resolve(process.cwd(), "scripts/migrations/048_stripe_refund_operations.sql"), "utf8");
  const billing = readFileSync(resolve(process.cwd(), "lib/subscriptions/billing.ts"), "utf8");
  const store = readFileSync(resolve(process.cwd(), "lib/subscriptions/store.ts"), "utf8");
  const terms = readFileSync(resolve(process.cwd(), "app/legal/terms/page.tsx"), "utf8");
  const billingSummary = readFileSync(resolve(process.cwd(), "app/api/account/billing/summary/route.ts"), "utf8");
  const membershipActions = readFileSync(resolve(process.cwd(), "components/marketing/MembershipActions.tsx"), "utf8");
  const setupCheck = readFileSync(resolve(process.cwd(), "scripts/check-billing-setup.mjs"), "utf8");
  const deployWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/deploy-azure.yml"), "utf8");
  assert.match(checkout, /supporterAmountAllowed/);
  assert.match(checkout, /termsAccepted: z\.literal\(true\)/);
  assert.match(checkout, /consent_collection: \{ terms_of_service: "required" \}/);
  assert.match(checkout, /payment_method_types: \["card"\]/);
  assert.match(checkout, /lockSupporterBillingControls\(client\)/);
  const webhook = readFileSync(resolve(process.cwd(), "app/api/account/billing/webhook/route.ts"), "utf8");
  assert.match(webhook, /site_shutdown_cancellation === "true"/);
  assert.match(webhook, /supporter-shutdown-webhook:\$\{eventId\}/);
  assert.doesNotMatch(admin, /applySupporterRenewalAmount/, "admins must not bulk-mutate subscriber-selected renewal amounts");
  assert.match(admin, /cancel_at_period_end: true/);
  assert.match(admin, /supporter_all_cancellations_scheduled/);
  assert.match(admin, /site_shutdown_cancellation: "true"/);
  assert.match(admin, /supporter_refund_operation_id/);
  assert.match(admin, /stripe_refund_operations/);
  assert.match(accountAmount, /supporterAmountAllowed/);
  assert.match(billing, /pg_try_advisory_xact_lock/);
  assert.match(billing, /STRIPE_MEMBERSHIP_WEBHOOK_SECRET/);
  assert.match(store, /trial_ends_at = NULL/);
  assert.match(migration, /minimum_amount_cents BETWEEN 500 AND 50000/);
  assert.match(migration, /subscriber_notice/);
  assert.match(refundMigration, /operation_id uuid PRIMARY KEY/);
  assert.match(refundMigration, /stripe_refund_id text UNIQUE/);
  assert.match(terms, /permanently discontinue any feature or the entire site/);
  assert.match(terms, /schedule the recurring subscription to end after the current paid period/);
  assert.match(terms, /does not by itself authorize us to silently increase/);
  assert.match(billingSummary, /otherwise, recurring support may be scheduled to end after your current paid period/);
  assert.doesNotMatch(membershipActions, /priceWarning\?\.kind === "outside_range"/);
  assert.match(setupCheck, /function stripeSecretMode/);
  assert.match(setupCheck, /function stripePublishableMode/);
  assert.match(setupCheck, /operationsPublishableSafe = publishableMode === "missing" \|\| matchingStripeKeys/);
  assert.match(setupCheck, /operationsOnly \? serverStripeKeyReady && operationsPublishableSafe : matchingStripeKeys/);
  assert.doesNotMatch(setupCheck, /sk_test_"\) \|\| key\.startsWith\("pk_test_/);
  const publicKeyGuard = deployWorkflow.indexOf("The public Stripe key must be empty or start with pk_test_ or pk_live_");
  const membershipBranch = deployWorkflow.indexOf('if [[ "$STRIPE_MEMBERSHIP_ENABLED" == "true" ]]');
  assert.ok(publicKeyGuard >= 0 && publicKeyGuard < membershipBranch, "public-key role validation must run even when membership checks are disabled");
});

test("public pricing surfaces use live controls instead of promising a stale minimum", () => {
  const files = [
    "components/marketing/PricingExperience.tsx",
    "components/marketing/SupporterCta.tsx",
    "components/chrome/TopNav.tsx",
  ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
  for (const source of files) {
    assert.match(source, /useSupporterBillingControls/);
    assert.doesNotMatch(source, /\$5(?:\+|\/month|\/mo| monthly)/);
  }
});
