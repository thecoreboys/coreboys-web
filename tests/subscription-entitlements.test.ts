import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error Node's type-stripping runner requires the TypeScript suffix.
import { ALWAYS_FREE_FEATURE_IDS, BILLING_FOUNDATION, FEATURE_IDS, INDEPENDENT_SERVICE_DISCLOSURES, PLAN_IDS, PLANS, catalogForClient, isAddOnId, minimumPlanForFeature, planIncludesFeature } from "../lib/subscriptions/catalog.ts";
// @ts-expect-error Node's type-stripping runner requires the TypeScript suffix.
import { entitlementDecision, resolveSubscriptionSnapshot } from "../lib/subscriptions/entitlements.ts";
// @ts-expect-error Node's type-stripping runner requires the TypeScript suffix.
import { LOCAL_OVERRIDE_ACKNOWLEDGEMENT, resolveLocalPlanOverride } from "../lib/subscriptions/local-override.ts";
import type { SubscriptionStorageSnapshot } from "../lib/subscriptions/store.ts";

function emptySnapshot(
  state: SubscriptionStorageSnapshot["state"] = "ready",
): SubscriptionStorageSnapshot {
  return { state, subscription: null, addOns: [], lifetime: null, usage: [] };
}

test("every plan keeps playback, accessibility, privacy, and account rights free", () => {
  for (const planId of PLAN_IDS) {
    for (const featureId of ALWAYS_FREE_FEATURE_IDS) {
      assert.equal(planIncludesFeature(planId, featureId), true, `${featureId} must be free on ${planId}`);
    }
  }
  assert.equal(planIncludesFeature("free", "search.semantic"), false);
  assert.equal(planIncludesFeature("free", "search.fuzzy_advanced"), true);
  assert.equal(planIncludesFeature("free", "multiview.expanded"), false);
  assert.equal(planIncludesFeature("plus", "queue.templates"), true);
  assert.equal(planIncludesFeature("plus", "multiview.saved_layouts"), true);
  assert.equal(planIncludesFeature("plus", "search.semantic"), true);
  assert.equal(planIncludesFeature("plus", "search.moments"), true);
  assert.equal(planIncludesFeature("business", "workspace.roles"), true);
});

test("deep search belongs to CORE Membership while legacy packs stay readable but unpublished", () => {
  assert.equal(minimumPlanForFeature("search.semantic"), "plus");
  assert.equal(minimumPlanForFeature("search.moments"), "plus");
  assert.equal(minimumPlanForFeature("search.fuzzy_advanced"), null);
  assert.equal(isAddOnId("semantic_search_pack_100"), true, "stored legacy purchases remain valid");
  assert.equal(
    catalogForClient().addOns.some((addOn) => addOn.id === "semantic_search_pack_100"),
    false,
    "legacy semantic query packs must not be sold in the client catalog",
  );
});

test("plan feature sets inherit monotonically", () => {
  for (let index = 1; index < PLAN_IDS.length; index += 1) {
    const previous = PLANS[PLAN_IDS[index - 1]!];
    const current = PLANS[PLAN_IDS[index]!];
    for (const featureId of previous.features) {
      assert.equal((current.features as readonly string[]).includes(featureId), true, `${current.id} should inherit ${featureId}`);
    }
  }
  assert.equal(new Set(FEATURE_IDS).size, FEATURE_IDS.length);
});

test("catalog sells independent software utility rather than content", () => {
  assert.equal(BILLING_FOUNDATION.checkoutAvailable, true);
  assert.equal(BILLING_FOUNDATION.chargesEnabled, true);
  assert.equal(BILLING_FOUNDATION.minimumMonthlyCents, 500);
  assert.match(INDEPENDENT_SERVICE_DISCLOSURES.affiliation, /Not affiliated/i);
  assert.match(INDEPENDENT_SERVICE_DISCLOSURES.paymentPurpose, /not access to creator content/i);
  assert.match(INDEPENDENT_SERVICE_DISCLOSURES.publicContentAccess, /remain available without a paid/i);
});

test("an absent or unmigrated subscription safely resolves to Free", () => {
  const state = resolveSubscriptionSnapshot({ snapshot: emptySnapshot("migration_required") });
  assert.equal(state.account.effectivePlanId, "free");
  assert.equal(state.account.status, "free");
  assert.equal(state.account.storageState, "migration_required");
  assert.equal(entitlementDecision(state, "playback.live").reason, "always_free");
  assert.equal(entitlementDecision(state, "search.semantic").allowed, false);
});

test("active subscriptions, lifetime licenses, and add-ons resolve deterministically", () => {
  const snapshot: SubscriptionStorageSnapshot = {
    ...emptySnapshot(),
    subscription: {
      planId: "plus",
      status: "active",
      source: "manual_local",
      billingInterval: "none",
      currentPeriodStart: "2026-08-01T00:00:00.000Z",
      currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
    },
    lifetime: {
      sku: "local_pro_lifetime",
      status: "active",
      grantedAt: "2026-08-01T00:00:00.000Z",
      revokedAt: null,
    },
    addOns: [{
      id: "addon-1",
      addOnId: "semantic_search_pack_100",
      status: "active",
      quantity: 2,
      startsAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
    }],
    usage: [{ meterId: "semantic_queries_monthly", periodKey: "2026-08", used: 50 }],
  };
  const state = resolveSubscriptionSnapshot({ snapshot, now: new Date("2026-08-20T12:00:00.000Z") });
  assert.equal(state.account.effectivePlanId, "pro");
  assert.equal(state.account.source, "local_lifetime");
  assert.equal(state.meters.semantic_queries_monthly.limit, 200);
  assert.equal(state.meters.semantic_queries_monthly.used, 50);
  assert.equal(state.meters.semantic_queries_monthly.remaining, 150);
});

test("expired periods and trials cannot keep paid entitlements", () => {
  const expired: SubscriptionStorageSnapshot = {
    ...emptySnapshot(),
    subscription: {
      planId: "business",
      status: "active",
      source: "future_billing",
      billingInterval: "month",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
    },
  };
  const state = resolveSubscriptionSnapshot({ snapshot: expired, now: new Date("2026-08-20T00:00:00.000Z") });
  assert.equal(state.account.effectivePlanId, "free");
  assert.equal(state.account.status, "active");
  assert.equal(state.account.hasManagedSubscription, false);
  assert.equal(entitlementDecision(state, "workspace.team").allowed, false);
});

test("a non-entitled Stripe contract still routes to billing recovery", () => {
  const snapshot: SubscriptionStorageSnapshot = {
    ...emptySnapshot(),
    subscription: {
      planId: "plus",
      status: "past_due",
      source: "future_billing",
      billingInterval: "month",
      currentPeriodStart: "2026-08-01T00:00:00.000Z",
      currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      externalCustomerRef: "cus_test",
      externalContractRef: "sub_test",
    },
  };
  const state = resolveSubscriptionSnapshot({ snapshot, now: new Date("2026-08-20T00:00:00.000Z") });
  assert.equal(state.account.effectivePlanId, "free");
  assert.equal(state.account.source, "free");
  assert.equal(state.account.hasManagedSubscription, true);
});

test("development override requires every local safety condition", () => {
  const base = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:56222/coreboys",
    SUBSCRIPTION_DEV_OVERRIDE_ENABLED: "true",
    SUBSCRIPTION_DEV_OVERRIDE_ACK: LOCAL_OVERRIDE_ACKNOWLEDGEMENT,
    SUBSCRIPTION_DEV_OVERRIDE_USER_ID: "user-1",
    SUBSCRIPTION_DEV_OVERRIDE_PLAN: "pro",
  };
  assert.deepEqual(
    resolveLocalPlanOverride({ env: base, requestHostname: "localhost", userId: "user-1" }),
    { active: true, planId: "pro", reason: "active" },
  );
  assert.equal(resolveLocalPlanOverride({ env: { ...base, NODE_ENV: "production" }, requestHostname: "localhost", userId: "user-1" }).active, false);
  assert.equal(resolveLocalPlanOverride({ env: { ...base, VERCEL: "1" }, requestHostname: "localhost", userId: "user-1" }).active, false);
  assert.equal(resolveLocalPlanOverride({ env: base, requestHostname: "thecoreboys.com", userId: "user-1" }).active, false);
  assert.equal(resolveLocalPlanOverride({ env: { ...base, DATABASE_URL: "postgresql://db.example.com/coreboys" }, requestHostname: "localhost", userId: "user-1" }).active, false);
  assert.equal(resolveLocalPlanOverride({ env: { ...base, SUBSCRIPTION_DEV_OVERRIDE_USER_ID: "*" }, requestHostname: "localhost", userId: "user-1" }).active, false);
  assert.equal(resolveLocalPlanOverride({ env: base, requestHostname: "localhost", userId: "user-2" }).active, false);
});

test("migration and account route preserve a server-side billing boundary", () => {
  const migration = readFileSync(resolve(process.cwd(), "scripts/migrations/016_subscription_entitlements.sql"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/account/subscription/route.ts"), "utf8");
  const stripe = readFileSync(resolve(process.cwd(), "lib/stripe.ts"), "utf8");
  const checkout = readFileSync(resolve(process.cwd(), "app/api/account/billing/checkout/route.ts"), "utf8");
  const webhook = readFileSync(resolve(process.cwd(), "app/api/account/billing/webhook/route.ts"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fan_subscriptions/);
  assert.match(migration, /fan_subscription_events is append-only/);
  assert.match(migration, /local_pro_lifetime/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /getStripe|stripe/);
  assert.match(stripe, /Server-only Stripe client/);
  assert.match(checkout, /mode: "subscription"/);
  assert.match(checkout, /supporterAmountAllowed/);
  assert.match(webhook, /constructEvent/);
});
