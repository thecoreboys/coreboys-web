import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { z } from "zod";
import {
  DEFAULT_SUPPORTER_BILLING_CONTROLS,
  SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
  supporterAmountAllowed,
} from "../lib/subscriptions/billing-policy";

type DependencyMap = Record<string, unknown>;
type JsonResult = { body: unknown; status: number };
type RouteModule = { POST(request: Request): Promise<JsonResult> };

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Execute the real route while replacing infrastructure imports with local fakes. */
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
    if (Object.prototype.hasOwnProperty.call(dependencies, specifier)) return dependencies[specifier];
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
    RegExp,
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

const nextServer = {
  NextResponse: {
    json(body: unknown, init?: { status?: number }): JsonResult {
      return { body, status: init?.status ?? 200 };
    },
  },
};

function jsonRequest(url: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("checkout route creates one monthly Stripe subscription with consent and a stable idempotency key", async () => {
  const createCalls: Array<{ payload: Record<string, unknown>; options: { idempotencyKey: string } }> = [];
  const opened: Array<Record<string, unknown>> = [];
  const transactionClient = { query: async () => ({ rows: [], rowCount: 0 }) };
  const stripe = {
    checkout: {
      sessions: {
        create: async (payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
          createCalls.push({ payload, options });
          return {
            id: "cs_test_monthly",
            url: "https://checkout.stripe.com/c/pay/cs_test_monthly",
            expires_at: 1_788_000_000,
          };
        },
        retrieve: async () => {
          throw new Error("a fresh reservation must not retrieve an older Checkout session");
        },
        expire: async () => {
          throw new Error("a successful Checkout creation must not expire its session");
        },
      },
    },
    customers: {
      retrieve: async () => {
        throw new Error("a new supporter must use their account email");
      },
    },
  };
  const route = loadServerModule<RouteModule>("app/api/account/billing/checkout/route.ts", {
    "next/server": nextServer,
    zod: { z },
    "@/lib/fan-auth": { getCurrentFanUserId: async () => "user-monthly" },
    "@/lib/fan-users": { getFanUserById: async () => ({ id: "user-monthly", email: "member@example.com" }) },
    "@/lib/stripe": { getStripe: () => stripe, stripeSecretKeyMode: () => "test" },
    "@/lib/db": {
      withTransaction: async (run: (client: typeof transactionClient) => Promise<unknown>) => run(transactionClient),
    },
    "@/lib/supporter-billing-account": { getAccountSupporterSubscription: async () => null },
    "@/lib/supporter-checkout": {
      reserveSupporterCheckout: async () => ({ kind: "reserved", attemptId: "01936f5d-6ac8-4dd4-93e8-72f8ca45560b" }),
      openSupporterCheckout: async (input: Record<string, unknown>, client: unknown) => {
        assert.equal(client, transactionClient);
        opened.push(input);
      },
      failSupporterCheckout: async () => undefined,
      finishSupporterCheckoutSession: async () => undefined,
    },
    "@/lib/subscriptions/entitlements": {
      getAccountSubscriptionState: async () => ({ account: { storageState: "ready", hasManagedSubscription: false } }),
    },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async (client?: unknown) => {
        if (client !== undefined) assert.equal(client, transactionClient);
        return DEFAULT_SUPPORTER_BILLING_CONTROLS;
      },
      lockSupporterBillingControls: async (client: unknown) => assert.equal(client, transactionClient),
      membershipCheckoutConfigured: () => true,
      publicSiteOrigin: () => "https://www.thecoreboys.com",
      supporterAmountAllowed,
      SUPPORTER_TERMS_VERSION: "2026-08-28",
    },
  });

  const response = await route.POST(jsonRequest("https://internal.example/api/account/billing/checkout", {
    amountCents: 1_250,
    termsAccepted: true,
  }));

  assert.deepEqual(plain(response), {
    body: { url: "https://checkout.stripe.com/c/pay/cs_test_monthly" },
    status: 200,
  });
  assert.equal(createCalls.length, 1);
  const call = createCalls[0]!;
  assert.equal(call.options.idempotencyKey, "supporter-checkout:01936f5d-6ac8-4dd4-93e8-72f8ca45560b");
  assert.equal(call.payload.mode, "subscription");
  assert.deepEqual(plain(call.payload.payment_method_types), ["card"]);
  assert.equal(call.payload.customer_email, "member@example.com");
  assert.equal(call.payload.client_reference_id, "user-monthly");
  assert.equal(call.payload.allow_promotion_codes, false);
  assert.deepEqual(plain(call.payload.consent_collection), { terms_of_service: "required" });
  assert.equal(call.payload.success_url, "https://www.thecoreboys.com/account/plan?billing=success");
  assert.equal(call.payload.cancel_url, "https://www.thecoreboys.com/account/plan?billing=canceled");

  const lineItems = call.payload.line_items as Array<Record<string, unknown>>;
  assert.equal(lineItems.length, 1, "Checkout must create exactly one recurring line item");
  assert.equal(lineItems[0]!.quantity, 1);
  const priceData = lineItems[0]!.price_data as Record<string, unknown>;
  assert.equal(priceData.currency, "usd");
  assert.equal(priceData.unit_amount, 1_250);
  assert.deepEqual(plain(priceData.recurring), { interval: "month" });

  const metadata = call.payload.metadata as Record<string, string>;
  const subscriptionData = call.payload.subscription_data as { metadata: Record<string, string> };
  assert.equal(metadata.kind, "supporter_membership");
  assert.equal(metadata.user_id, "user-monthly");
  assert.equal(metadata.recurring_amount_cents, "1250");
  assert.equal(metadata.recurring_interval, "month");
  assert.deepEqual(plain(subscriptionData.metadata), plain(metadata));
  assert.match(
    String((call.payload.custom_text as { submit: { message: string } }).submit.message),
    /recurring \$12\.50 monthly charge until you cancel/,
  );
  assert.deepEqual(plain(opened), [{
    userId: "user-monthly",
    attemptId: "01936f5d-6ac8-4dd4-93e8-72f8ca45560b",
    amountCents: 1_250,
    sessionId: "cs_test_monthly",
    sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_monthly",
    expiresAt: new Date(1_788_000_000 * 1_000).toISOString(),
  }]);
});

test("portal route creates a customer-scoped billing-management session", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const route = loadServerModule<RouteModule>("app/api/account/billing/portal/route.ts", {
    "next/server": nextServer,
    "@/lib/fan-auth": { getCurrentFanUserId: async () => "user-portal" },
    "@/lib/stripe": {
      getStripe: () => ({
        billingPortal: {
          sessions: {
            create: async (payload: Record<string, unknown>) => {
              calls.push(payload);
              return { url: "https://billing.stripe.com/p/session/test_portal" };
            },
          },
        },
      }),
    },
    "@/lib/subscriptions/billing": {
      membershipOperationsConfigured: () => true,
      publicSiteOrigin: () => "https://www.thecoreboys.com",
    },
    "@/lib/subscriptions/store": {
      getSubscriptionStorageSnapshot: async () => ({
        state: "ready",
        subscription: { externalCustomerRef: "cus_supporter", externalContractRef: "sub_supporter" },
      }),
    },
  });

  const response = await route.POST(new Request("https://internal.example/api/account/billing/portal", { method: "POST" }));
  assert.deepEqual(plain(response), {
    body: { url: "https://billing.stripe.com/p/session/test_portal" },
    status: 200,
  });
  assert.deepEqual(plain(calls), [{
    customer: "cus_supporter",
    return_url: "https://www.thecoreboys.com/account/plan",
  }]);
});

test("amount route changes the next monthly renewal with no proration or immediate quantity carry-over", async () => {
  const providerCalls: Array<{
    itemId: string;
    payload: Record<string, unknown>;
    options: { idempotencyKey: string };
  }> = [];
  const eventTypes: string[] = [];
  const lockClient = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      if (/SELECT external_contract_ref FROM fan_subscriptions/.test(sql)) {
        assert.equal(params[0], "user-amount");
        return { rows: [{ external_contract_ref: "sub_amount" }], rowCount: 1 };
      }
      const eventType = /'(supporter_amount_selection_[a-z]+)'/.exec(sql)?.[1];
      if (eventType) {
        eventTypes.push(eventType);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected amount SQL: ${sql}`);
    },
  };
  const subscription = {
    id: "sub_amount",
    status: "active",
    customer: "cus_amount",
    cancel_at_period_end: false,
    metadata: { kind: "supporter_membership", user_id: "user-amount" },
    items: {
      data: [{
        id: "si_amount",
        quantity: 4,
        price: { id: "price_previous", unit_amount: 250, product: "prod_supporter" },
      }],
    },
  };
  const stripe = {
    subscriptions: {
      retrieve: async () => subscription,
      update: async () => {
        throw new Error("a normal amount update must not alter cancellation state");
      },
    },
    subscriptionItems: {
      update: async (itemId: string, payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
        providerCalls.push({ itemId, payload, options });
      },
    },
  };
  const account = loadServerModule<{
    updateAccountSupporterAmount(input: {
      userId: string;
      amountCents: number;
      operationId: string;
      termsAccepted: true;
    }): Promise<Record<string, unknown>>;
  }>("lib/supporter-billing-account.ts", {
    "server-only": {},
    "@/lib/db": { query: lockClient.query },
    "@/lib/stripe": { getStripe: () => stripe },
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
      lockSupporterBillingControls: async (client: unknown) => assert.equal(client, lockClient),
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
      SUPPORTER_TERMS_VERSION: "2026-08-28",
    },
    "@/lib/subscriptions/store": {
      getSubscriptionStorageSnapshot: async () => ({ state: "ready", subscription: null }),
      withSupporterBillingLock: async (
        userId: string,
        run: (client: typeof lockClient) => Promise<unknown>,
      ) => {
        assert.equal(userId, "user-amount");
        return run(lockClient);
      },
    },
  });
  const route = loadServerModule<RouteModule>("app/api/account/billing/amount/route.ts", {
    "next/server": nextServer,
    zod: { z },
    "@/lib/fan-auth": { getCurrentFanUserId: async () => "user-amount" },
    "@/lib/supporter-billing-account": account,
    "@/lib/subscriptions/billing": {
      getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
      membershipOperationsConfigured: () => true,
      supporterAmountAllowed,
    },
  });
  const operationId = "5bb13cf8-79eb-4a79-92dc-ddc4f435a63c";

  const response = await route.POST(jsonRequest("https://www.thecoreboys.com/api/account/billing/amount", {
    amountCents: 1_500,
    termsAccepted: true,
    operationId,
  }));

  assert.deepEqual(plain(response), {
    body: { subscriptionId: "sub_amount", amountCents: 1_500, cancellationRemoved: false },
    status: 200,
  });
  assert.deepEqual(eventTypes, [
    "supporter_amount_selection_requested",
    "supporter_amount_selection_completed",
  ]);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0]!.itemId, "si_amount");
  assert.equal(providerCalls[0]!.options.idempotencyKey, `supporter-self-update:${operationId}`);
  assert.deepEqual(plain(providerCalls[0]!.payload), {
    price_data: {
      currency: "usd",
      unit_amount: 1_500,
      recurring: { interval: "month" },
      product: "prod_supporter",
    },
    quantity: 1,
    proration_behavior: "none",
  });
});

type StripeEvent = {
  id: string;
  created: number;
  type: string;
  data: { object: Record<string, unknown> };
};

function subscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sub_webhook",
    status: "active",
    customer: "cus_webhook",
    cancel_at_period_end: false,
    metadata: {
      kind: "supporter_membership",
      user_id: "user-webhook",
      terms_version: "2026-08-28",
      checkout_attempt_id: "dd7f15cb-e780-4ef7-bd93-703cc886425c",
    },
    items: {
      data: [{
        id: "si_webhook",
        quantity: 1,
        current_period_start: 1_777_500_000,
        current_period_end: 1_780_092_000,
        price: {
          unit_amount: 1_000,
          currency: "usd",
          recurring: { interval: "month" },
          product: "prod_supporter",
        },
      }],
    },
    ...overrides,
  };
}

function webhookRequest(event: StripeEvent, signature = "valid-signature"): Request {
  return jsonRequest("https://www.thecoreboys.com/api/account/billing/webhook", event, {
    "stripe-signature": signature,
  });
}

test("webhook route verifies the exact raw body and rejects an invalid Stripe signature before side effects", async () => {
  const previousSecret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
  process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET = "whsec_membership_test";
  let signatureInputs: [string, string, string] | null = null;
  let sideEffects = 0;
  try {
    const route = loadServerModule<RouteModule>("app/api/account/billing/webhook/route.ts", {
      "next/server": nextServer,
      "@/lib/stripe": {
        getStripe: () => ({
          webhooks: {
            constructEvent: (raw: string, signature: string, secret: string) => {
              signatureInputs = [raw, signature, secret];
              throw new Error("bad signature");
            },
          },
        }),
      },
      "@/lib/supporter-checkout": { finishSupporterCheckoutSession: async () => { sideEffects += 1; } },
      "@/lib/subscriptions/billing": {
        getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
        lockSupporterBillingControls: async () => undefined,
        membershipOperationsConfigured: () => true,
        SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      },
      "@/lib/subscriptions/store": {
        upsertStripeSubscription: async () => { sideEffects += 1; },
        withSupporterBillingLock: async () => { sideEffects += 1; },
      },
    });
    const event: StripeEvent = {
      id: "evt_invalid",
      created: 1_777_500_100,
      type: "checkout.session.expired",
      data: { object: { id: "cs_invalid" } },
    };
    const raw = JSON.stringify(event);
    const response = await route.POST(webhookRequest(event, "bad-signature"));

    assert.deepEqual(plain(response), { body: { error: "invalid_signature" }, status: 400 });
    assert.deepEqual(signatureInputs, [raw, "bad-signature", "whsec_membership_test"]);
    assert.equal(sideEffects, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
    else process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET = previousSecret;
  }
});

test("webhook route projects checkout, expiration, and subscription lifecycle events", async () => {
  const previousSecret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
  process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET = "whsec_membership_test";
  const projections: Array<Record<string, unknown>> = [];
  const finished: Array<[string, string]> = [];
  let currentSubscription = subscription();
  try {
    const stripe = {
      webhooks: {
        constructEvent: (raw: string, signature: string, secret: string) => {
          assert.equal(signature, "valid-signature");
          assert.equal(secret, "whsec_membership_test");
          return JSON.parse(raw) as StripeEvent;
        },
      },
      subscriptions: {
        retrieve: async (id: string) => {
          assert.equal(id, "sub_webhook");
          return currentSubscription;
        },
        update: async () => {
          throw new Error("ordinary lifecycle events must not mutate an in-range Stripe contract");
        },
      },
    };
    const client = { query: async () => ({ rows: [], rowCount: 0 }) };
    const route = loadServerModule<RouteModule>("app/api/account/billing/webhook/route.ts", {
      "next/server": nextServer,
      "@/lib/stripe": { getStripe: () => stripe },
      "@/lib/supporter-checkout": {
        finishSupporterCheckoutSession: async (id: string, state: string) => finished.push([id, state]),
      },
      "@/lib/subscriptions/billing": {
        getSupporterBillingControls: async () => DEFAULT_SUPPORTER_BILLING_CONTROLS,
        lockSupporterBillingControls: async (value: unknown) => assert.equal(value, client),
        membershipOperationsConfigured: () => true,
        SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      },
      "@/lib/subscriptions/store": {
        upsertStripeSubscription: async (projection: Record<string, unknown>, value: unknown) => {
          assert.equal(value, client);
          projections.push(projection);
          return { applied: true, contractMatched: true };
        },
        withSupporterBillingLock: async (
          userId: string,
          run: (value: typeof client) => Promise<unknown>,
        ) => {
          assert.equal(userId, "user-webhook");
          return run(client);
        },
      },
    });

    const checkoutEvent: StripeEvent = {
      id: "evt_checkout",
      created: 1_777_500_100,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_completed",
          subscription: "sub_webhook",
          metadata: {
            kind: "supporter_membership",
            checkout_attempt_id: "dd7f15cb-e780-4ef7-bd93-703cc886425c",
          },
          consent: { terms_of_service: "accepted" },
        },
      },
    };
    assert.equal((await route.POST(webhookRequest(checkoutEvent))).status, 200);
    assert.deepEqual(finished, [["cs_completed", "completed"]]);
    assert.deepEqual(plain(projections[0]), {
      userId: "user-webhook",
      customerId: "cus_webhook",
      subscriptionId: "sub_webhook",
      status: "active",
      currentPeriodStart: new Date(1_777_500_000 * 1_000).toISOString(),
      currentPeriodEnd: new Date(1_780_092_000 * 1_000).toISOString(),
      cancelAtPeriodEnd: false,
      providerEventId: "evt_checkout",
      providerEventCreatedAt: new Date(1_777_500_100 * 1_000).toISOString(),
      providerEventPriority: 20,
      allowContractReplace: true,
      checkoutAttemptId: "dd7f15cb-e780-4ef7-bd93-703cc886425c",
      billingConsent: {
        termsVersion: "2026-08-28",
        termsAccepted: true,
        amountCents: 1_000,
        currency: "usd",
        interval: "month",
        acceptedAt: new Date(1_777_500_100 * 1_000).toISOString(),
      },
    });

    const expiredEvent: StripeEvent = {
      id: "evt_expired",
      created: 1_777_500_200,
      type: "checkout.session.expired",
      data: { object: { id: "cs_expired" } },
    };
    assert.equal((await route.POST(webhookRequest(expiredEvent))).status, 200);
    assert.deepEqual(finished, [["cs_completed", "completed"], ["cs_expired", "expired"]]);

    const cases: Array<{ type: string; status: string; expectedStatus: string; priority: number }> = [
      { type: "customer.subscription.created", status: "active", expectedStatus: "active", priority: 10 },
      { type: "customer.subscription.updated", status: "unpaid", expectedStatus: "past_due", priority: 30 },
      { type: "customer.subscription.deleted", status: "canceled", expectedStatus: "canceled", priority: 40 },
    ];
    for (const [index, entry] of cases.entries()) {
      currentSubscription = subscription({ status: entry.status });
      const event: StripeEvent = {
        id: `evt_lifecycle_${index}`,
        created: 1_777_500_300 + index,
        type: entry.type,
        data: { object: { id: "sub_webhook" } },
      };
      assert.equal((await route.POST(webhookRequest(event))).status, 200);
      const projection = projections.at(-1)!;
      assert.equal(projection.status, entry.expectedStatus);
      assert.equal(projection.providerEventPriority, entry.priority);
      assert.equal(projection.providerEventId, event.id);
      assert.equal(projection.allowContractReplace, entry.type === "customer.subscription.created");
    }
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
    else process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET = previousSecret;
  }
});

test("duplicate webhook delivery schedules cancellation once and uses an event-derived Stripe idempotency key", async () => {
  const previousSecret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
  process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET = "whsec_membership_test";
  let currentSubscription = subscription();
  const providerUpdates: Array<{
    id: string;
    payload: Record<string, unknown>;
    options: { idempotencyKey: string };
  }> = [];
  const projections: Array<Record<string, unknown>> = [];
  try {
    const stripe = {
      webhooks: {
        constructEvent: (raw: string) => JSON.parse(raw) as StripeEvent,
      },
      subscriptions: {
        retrieve: async () => currentSubscription,
        update: async (id: string, payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
          providerUpdates.push({ id, payload, options });
          currentSubscription = {
            ...currentSubscription,
            cancel_at_period_end: true,
            metadata: payload.metadata,
          };
          return currentSubscription;
        },
      },
    };
    const client = { query: async () => ({ rows: [], rowCount: 0 }) };
    const route = loadServerModule<RouteModule>("app/api/account/billing/webhook/route.ts", {
      "next/server": nextServer,
      "@/lib/stripe": { getStripe: () => stripe },
      "@/lib/supporter-checkout": { finishSupporterCheckoutSession: async () => undefined },
      "@/lib/subscriptions/billing": {
        getSupporterBillingControls: async () => ({
          ...DEFAULT_SUPPORTER_BILLING_CONTROLS,
          renewalsDisabledAt: "2026-08-28T00:00:00.000Z",
        }),
        lockSupporterBillingControls: async () => undefined,
        membershipOperationsConfigured: () => true,
        SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
      },
      "@/lib/subscriptions/store": {
        upsertStripeSubscription: async (projection: Record<string, unknown>) => {
          projections.push(projection);
          return { applied: true, contractMatched: true };
        },
        withSupporterBillingLock: async (_userId: string, run: (value: typeof client) => Promise<unknown>) => run(client),
      },
    });
    const duplicateEvent: StripeEvent = {
      id: "evt_shutdown_duplicate",
      created: 1_777_500_500,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_webhook" } },
    };

    assert.equal((await route.POST(webhookRequest(duplicateEvent))).status, 200);
    assert.equal((await route.POST(webhookRequest(duplicateEvent))).status, 200);

    assert.equal(providerUpdates.length, 1, "the refreshed Stripe state makes duplicate delivery a no-op");
    assert.deepEqual(plain(providerUpdates[0]), {
      id: "sub_webhook",
      payload: {
        cancel_at_period_end: true,
        metadata: {
          kind: "supporter_membership",
          user_id: "user-webhook",
          terms_version: "2026-08-28",
          checkout_attempt_id: "dd7f15cb-e780-4ef7-bd93-703cc886425c",
          site_shutdown_cancellation: "true",
        },
      },
      options: { idempotencyKey: "supporter-shutdown-webhook:evt_shutdown_duplicate" },
    });
    assert.equal(projections.length, 2);
    assert.equal(projections.every((projection) => projection.providerEventId === "evt_shutdown_duplicate"), true);
    assert.equal(projections.every((projection) => projection.cancelAtPeriodEnd === true), true);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
    else process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET = previousSecret;
  }
});
