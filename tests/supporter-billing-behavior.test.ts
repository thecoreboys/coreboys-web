import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import {
  DEFAULT_SUPPORTER_BILLING_CONTROLS,
  SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
  supporterAmountAllowed,
  validSupporterBillingControls,
} from "../lib/subscriptions/billing-policy";
import {
  billingAnalyticsDateKeys,
  buildDailyFinanceSeries,
  buildDailySubscriptionSeries,
} from "../lib/supporter-billing-analytics";
import { resolveSubscriptionSnapshot } from "../lib/subscriptions/entitlements";
import type { SubscriptionStatus } from "../lib/subscriptions/catalog";
import type { SubscriptionStorageSnapshot } from "../lib/subscriptions/store";

type DependencyMap = Record<string, unknown>;

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Execute the real server module while replacing only its infrastructure
 * imports. This keeps these tests on exported production behavior without a
 * Postgres instance, Stripe network calls, or a test-only production seam.
 */
function loadServerModule<T extends object>(relativePath: string, dependencies: DependencyMap): T {
  const filename = resolve(process.cwd(), relativePath);
  const source = readFileSync(filename, "utf8");
  const javascript = transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const localRequire = (specifier: string) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, specifier)) {
      return dependencies[specifier];
    }
    throw new Error(`Unexpected dependency while loading ${relativePath}: ${specifier}`);
  };
  const context = vm.createContext({
    Array,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL,
    console,
    process,
  });
  const execute = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${javascript}\n})`,
    { filename },
  ).runInContext(context) as (
    exports: Record<string, unknown>,
    require: (specifier: string) => unknown,
    module: { exports: Record<string, unknown> },
    filename: string,
    dirname: string,
  ) => void;
  execute(module.exports, localRequire, module, filename, resolve(filename, ".."));
  return module.exports as T;
}

test("amount policy rejects fractional and unsafe values as well as values outside configured rails", () => {
  const narrowed = {
    ...DEFAULT_SUPPORTER_BILLING_CONTROLS,
    minimumAmountCents: 750,
    defaultAmountCents: 1_500,
    maximumAmountCents: 20_000,
  };

  assert.equal(validSupporterBillingControls(narrowed), true);
  for (const amount of [749, 20_001, 1_000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(supporterAmountAllowed(amount, narrowed), false, `${amount} must be rejected`);
  }
  assert.equal(supporterAmountAllowed(750, narrowed), true);
  assert.equal(supporterAmountAllowed(20_000, narrowed), true);
  assert.equal(validSupporterBillingControls({ ...narrowed, maximumAmountCents: Number.MAX_SAFE_INTEGER + 1 }), false);
});

test("UTC analytics stay stable at month boundaries and classify by Stripe reporting category", () => {
  const now = new Date("2028-03-01T00:01:00.000Z");
  assert.deepEqual(billingAnalyticsDateKeys(now, 3), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(billingAnalyticsDateKeys(now, 0), ["2028-03-01"]);

  const series = buildDailyFinanceSeries([
    // reportingCategory is authoritative when the legacy type disagrees.
    { created: Date.parse("2028-02-29T23:58:00Z") / 1_000, type: "charge", reportingCategory: "refund", amount: -250.9, fee: -7.9, net: -243.9, currency: "USD" },
    { created: Date.parse("2028-02-29T23:59:00Z") / 1_000, type: "payment", reportingCategory: "charge", amount: 1_000.9, fee: 59.9, net: 941.9, currency: "usd" },
    { created: Date.parse("2028-03-01T00:00:00Z") / 1_000, type: "payment_failure_refund", amount: -100, fee: 0, net: -100, currency: "usd" },
    { created: Date.parse("2028-03-01T00:00:30Z") / 1_000, type: "payout", amount: -500, fee: 0, net: -500, currency: "usd" },
    { created: Date.parse("2028-03-01T00:00:30Z") / 1_000, type: "charge", amount: 999, fee: 10, net: 989, currency: "eur" },
  ], now);

  assert.equal(series.length, 30);
  assert.deepEqual(series.at(-2), {
    date: "2028-02-29",
    grossCents: 1_000,
    feesCents: 52,
    refundsCents: 250,
    netCents: 698,
  });
  assert.deepEqual(series.at(-1), {
    date: "2028-03-01",
    grossCents: 0,
    feesCents: 0,
    refundsCents: 100,
    netCents: -100,
  });
});

test("subscription history reconstructs prior day-end counts without becoming negative", () => {
  const now = new Date("2026-08-28T23:59:59.000Z");
  const series = buildDailySubscriptionSeries([
    { created: Date.parse("2026-08-26T01:00:00Z") / 1_000, kind: "started" },
    { created: Date.parse("2026-08-26T02:00:00Z") / 1_000, kind: "started" },
    { created: Date.parse("2026-08-27T01:00:00Z") / 1_000, kind: "canceled" },
    { created: Date.parse("2026-08-28T01:00:00Z") / 1_000, kind: "canceled" },
    // Outside the 30-day window and therefore irrelevant.
    { created: Date.parse("2026-01-01T01:00:00Z") / 1_000, kind: "started" },
  ], -7.8, now);

  assert.deepEqual(series.slice(-3), [
    { date: "2026-08-26", active: 2, started: 2, canceled: 0 },
    { date: "2026-08-27", active: 1, started: 0, canceled: 1 },
    { date: "2026-08-28", active: 0, started: 0, canceled: 1 },
  ]);
  assert.equal(series.every((point) => point.active >= 0), true);
});

type CheckoutRow = {
  user_id: string;
  attempt_id: string;
  amount_cents: number;
  state: "creating" | "open" | "completed" | "expired" | "failed";
  stripe_session_id: string | null;
  stripe_session_url: string | null;
  expires_at: Date;
};

class CheckoutDatabaseFixture {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  readonly rows = new Map<string, CheckoutRow>();
  now = new Date("2026-08-28T12:00:00.000Z");

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("INSERT INTO supporter_checkout_attempts")) {
      const [userId, attemptId, amountCents, expiresAt] = params as [string, string, number, Date];
      const current = this.rows.get(userId);
      if (!current || ["completed", "expired", "failed"].includes(current.state) || (current.state === "creating" && current.expires_at <= this.now)) {
        const row: CheckoutRow = {
          user_id: userId,
          attempt_id: attemptId,
          amount_cents: amountCents,
          state: "creating",
          stripe_session_id: null,
          stripe_session_url: null,
          expires_at: expiresAt,
        };
        this.rows.set(userId, row);
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT attempt_id")) {
      const row = this.rows.get(params[0] as string);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (normalized.includes("SET state = 'open'")) {
      const [userId, attemptId, sessionId, sessionUrl, expiresAt, amountCents] = params as [string, string, string, string, Date, number];
      const row = this.rows.get(userId);
      if (row && row.attempt_id === attemptId && row.amount_cents === amountCents && row.state === "creating") {
        row.state = "open";
        row.stripe_session_id = sessionId;
        row.stripe_session_url = sessionUrl;
        row.expires_at = expiresAt;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("SET state = 'failed'")) {
      const [userId, attemptId] = params as [string, string];
      const row = this.rows.get(userId);
      if (row && row.attempt_id === attemptId && row.state === "creating") {
        row.state = "failed";
        row.stripe_session_url = null;
        row.expires_at = this.now;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("SET state = $2")) {
      const [sessionId, state] = params as [string, "completed" | "expired"];
      const row = [...this.rows.values()].find((candidate) => candidate.stripe_session_id === sessionId);
      if (row && ["creating", "open"].includes(row.state)) {
        row.state = state;
        row.stripe_session_url = null;
        row.expires_at = this.now;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected checkout SQL: ${normalized}`);
  }
}

type CheckoutModule = {
  reserveSupporterCheckout(input: { userId: string; amountCents: number; creatingExpiresAt: Date }): Promise<
    | { kind: "reserved"; attemptId: string }
    | { kind: "reused"; amountCents: number; url: string; expiresAt: string }
    | { kind: "reconcile"; amountCents: number; sessionId: string }
    | { kind: "busy"; amountCents: number; state: "creating" | "open" }
  >;
  openSupporterCheckout(input: { userId: string; attemptId: string; amountCents: number; sessionId: string; sessionUrl: string; expiresAt: Date }): Promise<void>;
  failSupporterCheckout(userId: string, attemptId: string): Promise<void>;
  finishSupporterCheckoutSession(sessionId: string, state: "completed" | "expired"): Promise<void>;
};

test("checkout reservation allows one in-flight session, reuses its URL, and releases terminal attempts", async () => {
  const database = new CheckoutDatabaseFixture();
  let nextAttempt = 0;
  const checkout = loadServerModule<CheckoutModule>("lib/supporter-checkout.ts", {
    "server-only": {},
    "node:crypto": { randomUUID: () => `attempt-${++nextAttempt}` },
    "@/lib/db": { query: database.query.bind(database) },
  });
  const creatingExpiresAt = new Date("2026-08-28T12:02:00.000Z");

  const first = await checkout.reserveSupporterCheckout({ userId: "user-1", amountCents: 1_000, creatingExpiresAt });
  const concurrent = await checkout.reserveSupporterCheckout({ userId: "user-1", amountCents: 1_000, creatingExpiresAt });
  assert.deepEqual(plain(first), { kind: "reserved", attemptId: "attempt-1" });
  assert.deepEqual(plain(concurrent), { kind: "busy", amountCents: 1_000, state: "creating" });

  const stripeExpiry = new Date("2099-08-28T12:31:00.000Z");
  await checkout.openSupporterCheckout({
    userId: "user-1",
    attemptId: "attempt-1",
    amountCents: 1_000,
    sessionId: "cs_test_1",
    sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
    expiresAt: stripeExpiry,
  });
  const sameAmount = await checkout.reserveSupporterCheckout({ userId: "user-1", amountCents: 1_000, creatingExpiresAt });
  const differentAmount = await checkout.reserveSupporterCheckout({ userId: "user-1", amountCents: 2_000, creatingExpiresAt });
  assert.deepEqual(plain(sameAmount), {
    kind: "reused",
    amountCents: 1_000,
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
    expiresAt: stripeExpiry.toISOString(),
  });
  assert.deepEqual(plain(differentAmount), { kind: "busy", amountCents: 1_000, state: "open" });

  await checkout.finishSupporterCheckoutSession("cs_test_1", "completed");
  const afterCompletion = await checkout.reserveSupporterCheckout({ userId: "user-1", amountCents: 2_000, creatingExpiresAt });
  assert.deepEqual(plain(afterCompletion), { kind: "reserved", attemptId: "attempt-5" });
  assert.equal(database.rows.get("user-1")?.amount_cents, 2_000);
  assert.match(database.calls[0]!.sql, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(database.calls[0]!.sql, /state = 'creating' AND supporter_checkout_attempts\.expires_at <= now\(\)/);

  const staleCreatingExpiry = new Date("2099-08-28T12:02:00.000Z");
  const staleReserved = await checkout.reserveSupporterCheckout({ userId: "user-2", amountCents: 1_000, creatingExpiresAt: staleCreatingExpiry });
  assert.deepEqual(plain(staleReserved), { kind: "reserved", attemptId: "attempt-6" });
  await checkout.openSupporterCheckout({
    userId: "user-2",
    attemptId: "attempt-6",
    amountCents: 1_000,
    sessionId: "cs_test_stale",
    sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_stale",
    expiresAt: new Date("2000-01-01T00:00:00.000Z"),
  });
  const needsReconciliation = await checkout.reserveSupporterCheckout({ userId: "user-2", amountCents: 2_000, creatingExpiresAt: staleCreatingExpiry });
  assert.deepEqual(plain(needsReconciliation), { kind: "reconcile", amountCents: 1_000, sessionId: "cs_test_stale" });
  await checkout.finishSupporterCheckoutSession("cs_test_stale", "expired");
  const afterExpiry = await checkout.reserveSupporterCheckout({ userId: "user-2", amountCents: 2_000, creatingExpiresAt: staleCreatingExpiry });
  assert.deepEqual(plain(afterExpiry), { kind: "reserved", attemptId: "attempt-8" });

  await assert.rejects(
    checkout.openSupporterCheckout({
      userId: "user-1",
      attemptId: "attempt-1",
      amountCents: 1_000,
      sessionId: "cs_stale",
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_stale",
      expiresAt: stripeExpiry,
    }),
    /checkout_reservation_lost/,
  );
});

type BillingControlRow = {
  minimum_amount_cents: number;
  maximum_amount_cents: number;
  default_amount_cents: number;
  subscriber_notice: string | null;
  notice_effective_at: Date | string | null;
  notice_published_at: Date | string | null;
  updated_at: Date | string | null;
};

type AdminModule = {
  supporterSubscriptionAmount(subscription: unknown): number | null;
  setSupporterBillingControls(input: {
    actorId: string;
    minimumAmountCents: number;
    maximumAmountCents: number;
    defaultAmountCents: number;
    subscriberNotice: string | null;
    noticeEffectiveAt: string | null;
  }): Promise<unknown>;
  scheduleOutOfRangeSupporterCancellations(input: { actorId: string }): Promise<{
    affected: number;
    failed: number;
    controlsChanged?: boolean;
    status: string;
  }>;
  scheduleAllSupporterCancellations(input: { actorId: string; reason: string }): Promise<{
    affected: number;
    failed: number;
    metadataRepairNeeded: number;
    orphanCancellationFailed: number;
    status: string;
  }>;
  refundStripePayment(input: { actorId: string; operationId: string; paymentIntentId: string; amountCents?: number }): Promise<{
    id: string;
    amount: number;
    status: string | null;
  }>;
};

function adminDependencies(overrides: Partial<DependencyMap> = {}): DependencyMap {
  return {
    "server-only": {},
    "node:crypto": { randomUUID: () => "batch-test" },
    "@/lib/db": {
      query: async () => ({ rows: [], rowCount: 1 }),
      withTransaction: async (run: (client: unknown) => Promise<unknown>) => run({}),
    },
    "@/lib/stripe": { getStripe: () => null },
    "@/lib/supporter-billing-analytics": {
      buildDailyFinanceSeries,
      buildDailySubscriptionSeries,
    },
    "@/lib/supporter-checkout": {
      finishSupporterCheckoutSession: async () => undefined,
    },
    "@/lib/subscriptions/store": {
      withSupporterBillingLock: async (
        _userId: string,
        run: (client: Record<string, unknown>) => Promise<unknown>,
      ) => run({}),
    },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
      lockSupporterBillingControls: async () => undefined,
      membershipOperationsConfigured: () => false,
      supporterAmountAllowed,
      SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      validSupporterBillingControls,
    },
    ...overrides,
  };
}

test("restrictive controls require a substantive notice and at least 30 days before effect", async () => {
  const current: BillingControlRow = {
    minimum_amount_cents: 500,
    maximum_amount_cents: 50_000,
    default_amount_cents: 1_000,
    subscriber_notice: null,
    notice_effective_at: null,
    notice_published_at: null,
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const writes: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      writes.push({ sql, params });
      if (/SELECT minimum_amount_cents/.test(sql)) return { rows: [current], rowCount: 1 };
      if (/UPDATE supporter_billing_controls/.test(sql)) {
        return {
          rows: [{
            minimum_amount_cents: params[0],
            maximum_amount_cents: params[1],
            default_amount_cents: params[2],
            subscriber_notice: params[3],
            notice_effective_at: params[4],
            notice_published_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (/INSERT INTO stripe_finance_audit/.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected controls SQL: ${sql}`);
    },
  };
  const admin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies({
    "@/lib/db": {
      query: async () => ({ rows: [], rowCount: 1 }),
      withTransaction: async (run: (transactionClient: typeof client) => Promise<unknown>) => run(client),
    },
  }));
  const base = {
    actorId: "admin-1",
    minimumAmountCents: 600,
    maximumAmountCents: 50_000,
    defaultAmountCents: 1_000,
  };

  await assert.rejects(
    admin.setSupporterBillingControls({ ...base, subscriberNotice: null, noticeEffectiveAt: null }),
    /notice_required/,
  );
  await assert.rejects(
    admin.setSupporterBillingControls({ ...base, subscriberNotice: "The minimum will change.", noticeEffectiveAt: null }),
    /notice_effective_date_required/,
  );
  await assert.rejects(
    admin.setSupporterBillingControls({
      ...base,
      subscriberNotice: "The minimum will change.",
      noticeEffectiveAt: new Date(Date.now() + 29 * 86_400_000).toISOString(),
    }),
    /notice_period_too_short/,
  );

  const effectiveAt = new Date(Date.now() + 31 * 86_400_000).toISOString();
  const updated = await admin.setSupporterBillingControls({
    ...base,
    subscriberNotice: "  The minimum will change after advance notice.  ",
    noticeEffectiveAt: effectiveAt,
  }) as { minimumAmountCents: number; subscriberNotice: string; noticeEffectiveAt: string };
  assert.equal(updated.minimumAmountCents, 600);
  assert.equal(updated.subscriberNotice, "The minimum will change after advance notice.");
  assert.equal(updated.noticeEffectiveAt, effectiveAt);
  const updateCall = writes.find((call) => /UPDATE supporter_billing_controls/.test(call.sql));
  assert.ok(updateCall);
  assert.equal(updateCall.params[3], "The minimum will change after advance notice.");
});

function subscription(input: {
  id: string;
  status: string;
  unitAmount?: number | null;
  quantity?: number;
  cancelAtPeriodEnd?: boolean;
  supporter?: boolean;
  itemCount?: number;
}) {
  const count = input.itemCount ?? 1;
  return {
    id: input.id,
    status: input.status,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    metadata: input.supporter === false
      ? { kind: "another_product" }
      : { kind: "supporter_membership", user_id: `user_${input.id}`, kept: "yes" },
    items: {
      data: Array.from({ length: count }, (_, index) => ({
        id: `si_${input.id}_${index}`,
        quantity: input.quantity,
        price: { unit_amount: input.unitAmount, product: "prod_supporter" },
      })),
    },
  };
}

test("threshold cancellation waits for a mature notice and covers recoverable Stripe statuses", async () => {
  const now = Date.now();
  const matureControls = {
    ...DEFAULT_SUPPORTER_BILLING_CONTROLS,
    minimumAmountCents: 500,
    maximumAmountCents: 50_000,
    subscriberNotice: "Choose an in-range price before the deadline.",
    noticePublishedAt: new Date(now - 31 * 86_400_000).toISOString(),
    noticeEffectiveAt: new Date(now - 60_000).toISOString(),
    updatedAt: "2026-08-28T00:00:00.000Z",
  };
  const subscriptions = [
    subscription({ id: "sub_low", status: "active", unitAmount: 499 }),
    subscription({ id: "sub_high_paused", status: "paused", unitAmount: 50_001 }),
    subscription({ id: "sub_high_unpaid", status: "unpaid", unitAmount: 60_000 }),
    subscription({ id: "sub_missing_incomplete", status: "incomplete", unitAmount: null }),
    subscription({ id: "sub_multiple", status: "trialing", unitAmount: 1_000, itemCount: 2 }),
    subscription({ id: "sub_total_in_range", status: "active", unitAmount: 300, quantity: 2 }),
    subscription({ id: "sub_past_due_in_range", status: "past_due", unitAmount: 1_000 }),
    subscription({ id: "sub_already_canceling", status: "active", unitAmount: 100, cancelAtPeriodEnd: true }),
    subscription({ id: "sub_terminal", status: "canceled", unitAmount: 100 }),
    subscription({ id: "sub_other_product", status: "active", unitAmount: 100, supporter: false }),
  ];
  const updates: Array<{ id: string; payload: Record<string, unknown>; options: { idempotencyKey: string } }> = [];
  let listCalls = 0;
  const stripe = {
    subscriptions: {
      list: async () => {
        listCalls += 1;
        return { data: subscriptions, has_more: false };
      },
      retrieve: async (id: string) => subscriptions.find((candidate) => candidate.id === id),
      update: async (id: string, payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
        updates.push({ id, payload, options });
        return { id };
      },
    },
  };
  const audit: Array<readonly unknown[]> = [];
  const admin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies({
    "@/lib/db": {
      query: async (_sql: string, params: readonly unknown[] = []) => {
        audit.push(params);
        return { rows: [], rowCount: 1 };
      },
      withTransaction: async () => { throw new Error("not used"); },
    },
    "@/lib/stripe": { getStripe: () => stripe },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => matureControls,
      lockSupporterBillingControls: async () => undefined,
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      validSupporterBillingControls,
    },
  }));

  const result = await admin.scheduleOutOfRangeSupporterCancellations({ actorId: "admin-1" });
  assert.deepEqual(plain(result), { batchId: "batch-test", affected: 5, failed: 0, controlsChanged: false, status: "completed" });
  assert.equal(listCalls, 1);
  assert.deepEqual(updates.map((update) => update.id), [
    "sub_low",
    "sub_high_paused",
    "sub_high_unpaid",
    "sub_missing_incomplete",
    "sub_multiple",
  ]);
  for (const update of updates) {
    assert.equal(update.payload.cancel_at_period_end, true);
    assert.deepEqual(plain(update.payload.metadata), {
      kind: "supporter_membership",
      user_id: `user_${update.id}`,
      kept: "yes",
      threshold_cancellation: "true",
      threshold_minimum_cents: "500",
      threshold_maximum_cents: "50000",
    });
    assert.match(update.options.idempotencyKey, /^supporter-threshold-cancel:/);
  }
  assert.equal(audit.length, 1);

  const prematureAdmin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies({
    "@/lib/stripe": { getStripe: () => stripe },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => ({
        ...matureControls,
        noticePublishedAt: new Date(now - 10 * 86_400_000).toISOString(),
      }),
      lockSupporterBillingControls: async () => undefined,
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      validSupporterBillingControls,
    },
  }));
  await assert.rejects(
    prematureAdmin.scheduleOutOfRangeSupporterCancellations({ actorId: "admin-1" }),
    /notice_period_too_short/,
  );
  assert.equal(listCalls, 1, "Stripe must not be queried until the notice matures");
});

test("threshold scan aborts explicitly when controls change before a provider mutation", async () => {
  const now = Date.now();
  const original = {
    ...DEFAULT_SUPPORTER_BILLING_CONTROLS,
    subscriberNotice: "The supported contribution range has changed.",
    noticePublishedAt: new Date(now - 40 * 86_400_000).toISOString(),
    noticeEffectiveAt: new Date(now - 5 * 86_400_000).toISOString(),
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  let controlsReads = 0;
  let updates = 0;
  const candidate = subscription({ id: "sub_stale_policy", status: "active", unitAmount: 499 });
  const admin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies({
    "@/lib/stripe": {
      getStripe: () => ({
        subscriptions: {
          list: async () => ({ data: [candidate], has_more: false }),
          retrieve: async () => candidate,
          update: async () => { updates += 1; },
        },
      }),
    },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => {
        controlsReads += 1;
        return controlsReads === 1 ? original : { ...original, maximumAmountCents: 40_000, updatedAt: "2026-08-28T00:00:00.000Z" };
      },
      lockSupporterBillingControls: async () => undefined,
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      validSupporterBillingControls,
    },
  }));

  const result = await admin.scheduleOutOfRangeSupporterCancellations({ actorId: "admin-1" });
  assert.equal(result.status, "aborted");
  assert.equal(result.controlsChanged, true);
  assert.equal(result.affected, 0);
  assert.equal(updates, 0);
});

test("subscription amount uses the full contract quantity and rejects ambiguous item sets", () => {
  const admin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies());
  assert.equal(admin.supporterSubscriptionAmount(subscription({ id: "one", status: "active", unitAmount: 1_000 })), 1_000);
  assert.equal(admin.supporterSubscriptionAmount(subscription({ id: "three", status: "active", unitAmount: 1_000, quantity: 3 })), 3_000);
  assert.equal(admin.supporterSubscriptionAmount(subscription({ id: "zero", status: "active", unitAmount: 1_000, quantity: 0 })), 1_000);
  assert.equal(admin.supporterSubscriptionAmount(subscription({ id: "missing", status: "active", unitAmount: null })), null);
  assert.equal(admin.supporterSubscriptionAmount(subscription({ id: "many", status: "active", unitAmount: 1_000, itemCount: 2 })), null);
});

test("shutdown attempts every managed contract and reports orphan cancellation failures", async () => {
  const windDownStartedAt = "2026-08-28T16:00:00.000Z";
  const subscriptions = [
    subscription({ id: "sub_active", status: "active", unitAmount: 1_000 }),
    { ...subscription({ id: "sub_threshold", status: "past_due", unitAmount: 400, cancelAtPeriodEnd: true }), metadata: { kind: "supporter_membership", user_id: "user_sub_threshold", threshold_cancellation: "true" } },
    { ...subscription({ id: "sub_marked", status: "active", unitAmount: 1_000, cancelAtPeriodEnd: true }), metadata: { kind: "supporter_membership", user_id: "user_sub_marked", site_shutdown_cancellation: "true" } },
    subscription({ id: "sub_terminal", status: "canceled", unitAmount: 1_000 }),
    { ...subscription({ id: "sub_orphan", status: "active", unitAmount: 1_000 }), metadata: { kind: "supporter_membership" } },
    { ...subscription({ id: "sub_orphan_failed", status: "active", unitAmount: 1_000 }), metadata: { kind: "supporter_membership" } },
  ];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async () => ({ id: "cs_open_shutdown", status: "open" }),
        expire: async () => ({ id: "cs_open_shutdown", status: "expired" }),
      },
    },
    subscriptions: {
      list: async () => ({ data: subscriptions, has_more: false }),
      retrieve: async (id: string) => subscriptions.find((candidate) => candidate.id === id),
      update: async (id: string, payload: Record<string, unknown>) => {
        if (id === "sub_orphan_failed") throw new Error("simulated Stripe failure");
        updates.push({ id, payload });
        return { id };
      },
    },
  };
  const finishedCheckout: Array<{ id: string; state: string }> = [];
  const admin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies({
    "@/lib/db": {
      query: async (sql: string) => /SELECT stripe_session_id/.test(sql)
        ? { rows: [{ stripe_session_id: "cs_open_shutdown" }], rowCount: 1 }
        : { rows: [], rowCount: 1 },
      withTransaction: async (run: (client: { query(sql: string): Promise<unknown> }) => Promise<unknown>) => run({
        query: async (sql: string) => {
          if (/UPDATE supporter_billing_controls/.test(sql)) {
            return { rows: [{ renewals_disabled_at: windDownStartedAt }], rowCount: 1 };
          }
          if (/INSERT INTO stripe_finance_audit/.test(sql)) return { rows: [], rowCount: 1 };
          throw new Error(`Unexpected shutdown SQL: ${sql}`);
        },
      }),
    },
    "@/lib/stripe": { getStripe: () => stripe },
    "@/lib/supporter-checkout": {
      finishSupporterCheckoutSession: async (id: string, state: string) => { finishedCheckout.push({ id, state }); },
    },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
      lockSupporterBillingControls: async () => undefined,
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      validSupporterBillingControls,
    },
  }));

  const result = await admin.scheduleAllSupporterCancellations({ actorId: "admin-1", reason: "The paid service is being discontinued." });
  assert.deepEqual(plain(result), {
    batchId: "batch-test",
    affected: 3,
    failed: 1,
    metadataRepairNeeded: 2,
    orphanCancellationFailed: 1,
    checkoutSessionsExpired: 1,
    checkoutSessionsFailed: 0,
    status: "partial",
    renewalsDisabledAt: windDownStartedAt,
  });
  assert.deepEqual(updates.map((entry) => entry.id), ["sub_active", "sub_threshold", "sub_orphan"]);
  assert.deepEqual(finishedCheckout, [{ id: "cs_open_shutdown", state: "expired" }]);
  for (const update of updates) {
    assert.equal(update.payload.cancel_at_period_end, true);
    assert.equal((update.payload.metadata as Record<string, string>).site_shutdown_cancellation, "true");
  }
  assert.equal((updates[1]!.payload.metadata as Record<string, string>).threshold_cancellation, "true");
});

test("durable refund operations return the stored result instead of creating a second refund", async () => {
  type OperationRow = {
    operation_id: string;
    actor_id: string;
    payment_intent_id: string;
    requested_amount_cents: number | null;
    state: string;
    lease_expires_at: Date | null;
    stripe_refund_id: string | null;
    stripe_refund_amount_cents: number | null;
    stripe_refund_status: string | null;
  };
  let operation: OperationRow | null = null;
  let createCalls = 0;
  const refunds: Array<{ id: string; amount: number; status: string; metadata: Record<string, string> }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      if (/INSERT INTO stripe_refund_operations/.test(sql)) {
        if (operation) return { rows: [], rowCount: 0 };
        operation = {
          operation_id: String(params[0]), actor_id: String(params[1]), payment_intent_id: String(params[2]),
          requested_amount_cents: params[3] == null ? null : Number(params[3]), state: "creating",
          lease_expires_at: new Date(Date.now() + 300_000), stripe_refund_id: null,
          stripe_refund_amount_cents: null, stripe_refund_status: null,
        };
        return { rows: [operation], rowCount: 1 };
      }
      if (/SELECT \* FROM stripe_refund_operations/.test(sql)) return { rows: operation ? [operation] : [], rowCount: operation ? 1 : 0 };
      if (/SET state = 'creating'/.test(sql)) return { rows: [], rowCount: 1 };
      if (/SET state = 'succeeded'/.test(sql)) {
        assert.ok(operation);
        operation.state = "succeeded";
        operation.lease_expires_at = null;
        operation.stripe_refund_id = String(params[1]);
        operation.stripe_refund_amount_cents = Number(params[2]);
        operation.stripe_refund_status = String(params[3]);
        return { rows: [operation], rowCount: 1 };
      }
      if (/INSERT INTO stripe_finance_audit/.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected refund SQL: ${sql}`);
    },
  };
  const stripe = {
    refunds: {
      list: async () => ({ data: refunds, has_more: false }),
      create: async (payload: { amount?: number; metadata: Record<string, string> }) => {
        createCalls += 1;
        const refund = { id: "re_durable", amount: payload.amount ?? 2_000, status: "succeeded", metadata: payload.metadata };
        refunds.push(refund);
        return refund;
      },
    },
  };
  const admin = loadServerModule<AdminModule>("lib/supporter-billing-admin.ts", adminDependencies({
    "@/lib/db": {
      query: async (sql: string) => {
        if (/INSERT INTO stripe_finance_audit/.test(sql) || /UPDATE stripe_refund_operations/.test(sql)) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected refund outer SQL: ${sql}`);
      },
      withTransaction: async (run: (transactionClient: typeof client) => Promise<unknown>) => run(client),
    },
    "@/lib/stripe": { getStripe: () => stripe },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
      lockSupporterBillingControls: async () => undefined,
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      validSupporterBillingControls,
    },
  }));
  const request = { actorId: "admin-1", operationId: "4f9c36ea-77a0-4cf8-9d13-936ed2d55089", paymentIntentId: "pi_test", amountCents: 750 };
  const first = await admin.refundStripePayment(request);
  const replay = await admin.refundStripePayment(request);
  assert.deepEqual(plain(first), { id: "re_durable", amount: 750, status: "succeeded" });
  assert.deepEqual(plain(replay), plain(first));
  assert.equal(createCalls, 1);
  await assert.rejects(admin.refundStripePayment({ ...request, amountCents: 500 }), /refund_operation_mismatch/);
});

type AccountBillingModule = {
  updateAccountSupporterAmount(input: { userId: string; amountCents: number; operationId: string; termsAccepted: true }): Promise<{
    subscriptionId: string;
    amountCents: number;
    cancellationRemoved: boolean;
  }>;
};

test("self-service amount changes durably record consent before Stripe and use one operation id", async () => {
  const order: string[] = [];
  const eventPayloads: Array<Record<string, unknown>> = [];
  let lockCalls = 0;
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: "sub_account",
        status: "active",
        customer: "cus_account",
        cancel_at_period_end: true,
        metadata: { kind: "supporter_membership", user_id: "user-1", threshold_cancellation: "true" },
        items: { data: [{ id: "si_account", quantity: 3, price: { id: "price_old", unit_amount: 400, product: "prod_account" } }] },
      }),
      update: async (_id: string, payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
        order.push("subscription-reactivated");
        assert.equal(payload.cancel_at_period_end, false);
        assert.equal(options.idempotencyKey, "supporter-threshold-reactivate:operation-1");
      },
    },
    subscriptionItems: {
      update: async (_id: string, payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
        order.push("stripe-amount-updated");
        assert.equal(payload.quantity, 1);
        assert.equal((payload.price_data as Record<string, unknown>).unit_amount, 1_000);
        assert.equal(options.idempotencyKey, "supporter-self-update:operation-1");
      },
    },
  };
  const executeQuery = async (sql: string, params: readonly unknown[] = []) => {
    if (/SELECT external_contract_ref FROM fan_subscriptions/.test(sql)) {
      assert.equal(params.length, 1);
      assert.equal(params[0], "user-1");
      return { rows: [{ external_contract_ref: "sub_account" }], rowCount: 1 };
    }
    const eventType = /'(supporter_amount_selection_[a-z]+)'/.exec(sql)?.[1];
    if (eventType) {
      order.push(eventType);
      eventPayloads.push(JSON.parse(String(params[1])) as Record<string, unknown>);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected self-service SQL: ${sql}`);
  };
  const lockClient = { query: executeQuery };
  const account = loadServerModule<AccountBillingModule>("lib/supporter-billing-account.ts", {
    "server-only": {},
    "@/lib/db": {
      query: executeQuery,
    },
    "@/lib/stripe": { getStripe: () => stripe },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async (client: unknown) => {
        assert.equal(client, lockClient);
        return DEFAULT_SUPPORTER_BILLING_CONTROLS;
      },
      lockSupporterBillingControls: async (client: unknown) => {
        assert.equal(client, lockClient);
      },
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_TERMS_VERSION: "2026-08-28",
    },
    "@/lib/subscriptions/store": {
      getSubscriptionStorageSnapshot: async () => ({
        state: "ready",
        subscription: { externalContractRef: "sub_account" },
        addOns: [],
        lifetime: null,
        usage: [],
      }),
      withSupporterBillingLock: async (
        userId: string,
        run: (client: typeof lockClient) => Promise<unknown>,
      ) => {
        assert.equal(userId, "user-1");
        lockCalls += 1;
        return run(lockClient);
      },
    },
  });

  const result = await account.updateAccountSupporterAmount({ userId: "user-1", amountCents: 1_000, operationId: "operation-1", termsAccepted: true });
  assert.deepEqual(plain(result), { subscriptionId: "sub_account", amountCents: 1_000, cancellationRemoved: true });
  assert.deepEqual(order, [
    "supporter_amount_selection_requested",
    "stripe-amount-updated",
    "subscription-reactivated",
    "supporter_amount_selection_completed",
  ]);
  assert.equal(eventPayloads[0]!.operationId, "operation-1");
  assert.equal(eventPayloads[0]!.termsAccepted, true);
  assert.equal(eventPayloads[0]!.termsVersion, "2026-08-28");
  assert.equal(typeof eventPayloads[0]!.acceptedAt, "string");
  assert.equal(lockCalls, 1);
});

test("every nonterminal stored Stripe contract routes to billing recovery", () => {
  const base: SubscriptionStorageSnapshot = {
    state: "ready",
    subscription: null,
    addOns: [],
    lifetime: null,
    usage: [],
  };
  const statuses: SubscriptionStatus[] = ["active", "trialing", "past_due", "paused", "incomplete", "canceled", "expired"];
  for (const status of statuses) {
    const state = resolveSubscriptionSnapshot({
      snapshot: {
        ...base,
        subscription: {
          planId: "plus",
          status,
          source: "future_billing",
          billingInterval: "month",
          currentPeriodStart: null,
          currentPeriodEnd: null,
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          externalCustomerRef: "cus_test",
          externalContractRef: "sub_test",
        },
      },
      now: new Date("2026-08-28T00:00:00.000Z"),
    });
    assert.equal(
      state.account.hasManagedSubscription,
      status !== "canceled" && status !== "expired",
      `${status} contract recovery routing is incorrect`,
    );
  }

  const manualState = resolveSubscriptionSnapshot({
    snapshot: {
      ...base,
      subscription: {
        planId: "plus",
        status: "past_due",
        source: "manual_local",
        billingInterval: "none",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
      },
    },
  });
  assert.equal(manualState.account.hasManagedSubscription, false);
});
