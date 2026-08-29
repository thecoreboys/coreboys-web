import "server-only";

import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { query, withTransaction } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import {
  buildDailyFinanceSeries,
  buildDailySubscriptionSeries,
  type BillingBalanceEntry,
  type SubscriptionMovement,
} from "@/lib/supporter-billing-analytics";
import { withSupporterBillingLock } from "@/lib/subscriptions/store";
import { finishSupporterCheckoutSession } from "@/lib/supporter-checkout";
import {
  getSupporterBillingControls,
  lockSupporterBillingControls,
  membershipOperationsConfigured,
  SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
  validSupporterBillingControls,
  type SupporterBillingControls,
} from "@/lib/subscriptions/billing";

const SUPPORTER_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "paused",
  "unpaid",
  "incomplete",
]);
const MAX_STRIPE_LIST_PAGES = 100_000;
const DAY_MS = 86_400_000;

type StripePage<T extends { id: string }> = { data: T[]; has_more: boolean };

type BillingControlRow = {
  minimum_amount_cents: number;
  maximum_amount_cents: number;
  default_amount_cents: number;
  subscriber_notice: string | null;
  notice_effective_at: Date | string | null;
  notice_published_at: Date | string | null;
  renewals_disabled_at: Date | string | null;
  updated_at: Date | string | null;
};

type RefundOperationRow = {
  operation_id: string;
  actor_id: string;
  payment_intent_id: string;
  requested_amount_cents: number | null;
  state: "creating" | "succeeded" | "failed";
  lease_expires_at: Date | string | null;
  stripe_refund_id: string | null;
  stripe_refund_amount_cents: number | null;
  stripe_refund_status: string | null;
};

type RefundResult = { id: string; amount: number; status: string | null };

function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function controlsFromRow(row: BillingControlRow): SupporterBillingControls {
  return {
    minimumAmountCents: row.minimum_amount_cents,
    maximumAmountCents: row.maximum_amount_cents,
    defaultAmountCents: row.default_amount_cents,
    subscriberNotice: row.subscriber_notice,
    noticeEffectiveAt: iso(row.notice_effective_at),
    noticePublishedAt: iso(row.notice_published_at),
    renewalsDisabledAt: iso(row.renewals_disabled_at),
    updatedAt: iso(row.updated_at),
  };
}

function isSupporterSubscription(subscription: Stripe.Subscription): boolean {
  return subscription.metadata.kind === "supporter_membership";
}

export function supporterSubscriptionAmount(subscription: Stripe.Subscription): number | null {
  if (subscription.items.data.length !== 1) return null;
  const item = subscription.items.data[0];
  const unitAmount = item?.price.unit_amount;
  if (!item || typeof unitAmount !== "number") return null;
  return unitAmount * Math.max(1, item.quantity ?? 1);
}

async function listAll<T extends { id: string }>(
  load: (startingAfter?: string) => Promise<StripePage<T>>,
): Promise<T[]> {
  const items: T[] = [];
  const cursors = new Set<string>();
  let startingAfter: string | undefined;
  let pages = 0;
  do {
    const page = await load(startingAfter);
    pages += 1;
    items.push(...page.data);
    if (!page.has_more) break;
    const nextCursor = page.data.at(-1)?.id;
    if (!nextCursor || cursors.has(nextCursor) || pages >= MAX_STRIPE_LIST_PAGES) {
      throw new Error("stripe_pagination_incomplete");
    }
    cursors.add(nextCursor);
    startingAfter = nextCursor;
  } while (startingAfter);
  return items;
}

function stripeMode(): "test" | "live" | "unknown" {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
}

async function recordAudit(input: {
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  payload: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO stripe_finance_audit (actor_id, action, stripe_object_type, stripe_object_id, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [input.actorId, input.action, input.objectType, input.objectId, JSON.stringify(input.payload)],
  );
}

async function reserveRefundOperation(input: {
  actorId: string;
  operationId: string;
  paymentIntentId: string;
  amountCents?: number;
}): Promise<{ kind: "execute"; reconcileFirst: boolean } | { kind: "in_progress" } | { kind: "cached"; refund: RefundResult }> {
  return withTransaction(async (client) => {
    const inserted = await client.query<RefundOperationRow>(
      `INSERT INTO stripe_refund_operations (
         operation_id, actor_id, payment_intent_id, requested_amount_cents, state, lease_expires_at
       ) VALUES ($1::uuid, $2, $3, $4, 'creating', now() + interval '5 minutes')
       ON CONFLICT (operation_id) DO NOTHING
       RETURNING *`,
      [input.operationId, input.actorId, input.paymentIntentId, input.amountCents ?? null],
    );
    if (inserted.rows[0]) return { kind: "execute", reconcileFirst: false };

    const existing = await client.query<RefundOperationRow>(
      `SELECT * FROM stripe_refund_operations WHERE operation_id = $1::uuid FOR UPDATE`,
      [input.operationId],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("refund_operation_missing");
    if (row.actor_id !== input.actorId
      || row.payment_intent_id !== input.paymentIntentId
      || row.requested_amount_cents !== (input.amountCents ?? null)) {
      throw new Error("refund_operation_mismatch");
    }
    if (row.state === "succeeded" && row.stripe_refund_id && row.stripe_refund_amount_cents != null) {
      return {
        kind: "cached",
        refund: { id: row.stripe_refund_id, amount: row.stripe_refund_amount_cents, status: row.stripe_refund_status },
      };
    }
    const leaseExpiresAt = row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : 0;
    if (row.state === "creating" && leaseExpiresAt > Date.now()) return { kind: "in_progress" };
    await client.query(
      `UPDATE stripe_refund_operations
          SET state = 'creating', lease_expires_at = now() + interval '5 minutes', last_error = NULL, updated_at = now()
        WHERE operation_id = $1::uuid`,
      [input.operationId],
    );
    return { kind: "execute", reconcileFirst: true };
  });
}

async function completeRefundOperation(input: {
  actorId: string;
  operationId: string;
  paymentIntentId: string;
  amountCents?: number;
  refund: Stripe.Refund;
}): Promise<RefundResult> {
  return withTransaction(async (client) => {
    const result = await client.query<RefundOperationRow>(
      `UPDATE stripe_refund_operations
          SET state = 'succeeded', lease_expires_at = NULL, stripe_refund_id = $2,
              stripe_refund_amount_cents = $3, stripe_refund_status = $4, last_error = NULL, updated_at = now()
        WHERE operation_id = $1::uuid
          AND actor_id = $5
          AND payment_intent_id = $6
          AND requested_amount_cents IS NOT DISTINCT FROM $7::integer
        RETURNING *`,
      [input.operationId, input.refund.id, input.refund.amount, input.refund.status, input.actorId, input.paymentIntentId, input.amountCents ?? null],
    );
    const row = result.rows[0];
    if (!row?.stripe_refund_id || row.stripe_refund_amount_cents == null) throw new Error("refund_operation_mismatch");
    await client.query(
      `INSERT INTO stripe_finance_audit (actor_id, action, stripe_object_type, stripe_object_id, payload)
       VALUES ($1, 'stripe_refund_created', 'refund', $2, $3::jsonb)`,
      [input.actorId, input.refund.id, JSON.stringify({ operationId: input.operationId, paymentIntentId: input.paymentIntentId, amountCents: input.refund.amount, status: input.refund.status })],
    );
    return { id: row.stripe_refund_id, amount: row.stripe_refund_amount_cents, status: row.stripe_refund_status };
  });
}

function emptyDesk(controls: SupporterBillingControls) {
  return {
    configured: false,
    stripeMode: stripeMode(),
    controls,
    analyticsErrors: [] as string[],
    finance: null,
    subscriptions: null,
    charges: [],
    refunds: [],
    invoices: [],
  };
}

export async function getBillingDesk() {
  const controls = await getSupporterBillingControls();
  const stripe = getStripe();
  if (!membershipOperationsConfigured() || !stripe) return emptyDesk(controls);

  const now = new Date();
  const rangeStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 29 * 86_400_000;
  const rangeStart = Math.floor(rangeStartMs / 1000);
  const [
    balanceResult,
    transactionsResult,
    chargesResult,
    refundsResult,
    invoicesResult,
    subscriptionsResult,
    subscriptionCreatedResult,
    subscriptionDeletedResult,
    subscriptionUpdatedResult,
  ] = await Promise.allSettled([
    stripe.balance.retrieve(),
    listAll<Stripe.BalanceTransaction>((startingAfter) => stripe.balanceTransactions.list({
      limit: 100,
      created: { gte: rangeStart },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
    stripe.charges.list({ limit: 30 }),
    stripe.refunds.list({ limit: 30 }),
    stripe.invoices.list({ limit: 30 }),
    listAll<Stripe.Subscription>((startingAfter) => stripe.subscriptions.list({
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
    listAll<Stripe.Event>((startingAfter) => stripe.events.list({
      type: "customer.subscription.created",
      created: { gte: rangeStart },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
    listAll<Stripe.Event>((startingAfter) => stripe.events.list({
      type: "customer.subscription.deleted",
      created: { gte: rangeStart },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
    listAll<Stripe.Event>((startingAfter) => stripe.events.list({
      type: "customer.subscription.updated",
      created: { gte: rangeStart },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })),
  ] as const);

  const analyticsErrors: string[] = [];
  if (balanceResult.status === "rejected") analyticsErrors.push("Stripe balance is temporarily unavailable.");
  if (transactionsResult.status === "rejected") analyticsErrors.push("The 30-day finance graph is temporarily unavailable.");
  if (chargesResult.status === "rejected") analyticsErrors.push("Recent charges are temporarily unavailable.");
  if (refundsResult.status === "rejected") analyticsErrors.push("Refund history is temporarily unavailable.");
  if (invoicesResult.status === "rejected") analyticsErrors.push("Recent invoices are temporarily unavailable.");
  if (subscriptionsResult.status === "rejected") analyticsErrors.push("Supporter contract totals are temporarily unavailable.");
  if (subscriptionCreatedResult.status === "rejected" || subscriptionDeletedResult.status === "rejected" || subscriptionUpdatedResult.status === "rejected") {
    analyticsErrors.push("The 30-day supporter movement graph is temporarily unavailable.");
  }

  const transactions = transactionsResult.status === "fulfilled" ? transactionsResult.value : null;
  const allSubscriptions = subscriptionsResult.status === "fulfilled" ? subscriptionsResult.value : null;
  const subscriptionCreatedEvents = subscriptionCreatedResult.status === "fulfilled" ? subscriptionCreatedResult.value : [];
  const subscriptionDeletedEvents = subscriptionDeletedResult.status === "fulfilled" ? subscriptionDeletedResult.value : [];
  const subscriptionUpdatedEvents = subscriptionUpdatedResult.status === "fulfilled" ? subscriptionUpdatedResult.value : [];
  const movementDataReady = subscriptionCreatedResult.status === "fulfilled"
    && subscriptionDeletedResult.status === "fulfilled"
    && subscriptionUpdatedResult.status === "fulfilled";

  const financeEntries: BillingBalanceEntry[] = (transactions ?? []).map((entry) => ({
    created: entry.created,
    type: entry.type,
    reportingCategory: entry.reporting_category,
    amount: entry.amount,
    fee: entry.fee,
    net: entry.net,
    currency: entry.currency,
  }));
  const financeDaily = transactions ? buildDailyFinanceSeries(financeEntries, now, "usd") : null;
  const supporterSubscriptions = (allSubscriptions ?? []).filter(isSupporterSubscription);
  const currentManagedSubscriptions = supporterSubscriptions.filter((subscription) => SUPPORTER_STATUSES.has(subscription.status));
  const movementsByContract = new Map<string, SubscriptionMovement>();
  const addMovement = (key: string, movement: SubscriptionMovement) => {
    const existing = movementsByContract.get(key);
    if (!existing || movement.created < existing.created) movementsByContract.set(key, movement);
  };
  if (movementDataReady) {
    for (const event of subscriptionCreatedEvents) {
      const subscription = event.data.object as Stripe.Subscription;
      if (isSupporterSubscription(subscription)) addMovement(`started:${subscription.id}`, { created: event.created, kind: "started" });
    }
    for (const event of subscriptionDeletedEvents) {
      const subscription = event.data.object as Stripe.Subscription;
      if (isSupporterSubscription(subscription)) addMovement(`ended:${subscription.id}`, { created: event.created, kind: "canceled" });
    }
    for (const event of subscriptionUpdatedEvents) {
      const subscription = event.data.object as Stripe.Subscription;
      const previous = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
      if (isSupporterSubscription(subscription) && subscription.status === "incomplete_expired" && previous?.status !== "incomplete_expired") {
        addMovement(`ended:${subscription.id}`, { created: event.created, kind: "canceled" });
      }
    }
  }
  const subscriptionDaily = allSubscriptions && movementDataReady
    ? buildDailySubscriptionSeries([...movementsByContract.values()], currentManagedSubscriptions.length, now)
    : null;
  const outsideRange = currentManagedSubscriptions.filter((subscription) => {
    const amount = supporterSubscriptionAmount(subscription);
    return amount == null || amount < controls.minimumAmountCents || amount > controls.maximumAmountCents;
  });

  return {
    configured: true,
    stripeMode: stripeMode(),
    controls,
    analyticsErrors,
    finance: financeDaily ? {
      rangeStart: new Date(rangeStartMs).toISOString(),
      rangeEnd: now.toISOString(),
      currency: "usd",
      scope: "stripe_account" as const,
      grossCents: financeDaily.reduce((sum, point) => sum + point.grossCents, 0),
      feesCents: financeDaily.reduce((sum, point) => sum + point.feesCents, 0),
      refundsCents: financeDaily.reduce((sum, point) => sum + point.refundsCents, 0),
      netCents: financeDaily.reduce((sum, point) => sum + point.netCents, 0),
      daily: financeDaily,
      available: balanceResult.status === "fulfilled" ? balanceResult.value.available.map((item) => ({ currency: item.currency, amount: item.amount })) : [],
      pending: balanceResult.status === "fulfilled" ? balanceResult.value.pending.map((item) => ({ currency: item.currency, amount: item.amount })) : [],
    } : null,
    subscriptions: allSubscriptions ? {
      active: currentManagedSubscriptions.filter((subscription) => subscription.status === "active").length,
      trialing: currentManagedSubscriptions.filter((subscription) => subscription.status === "trialing").length,
      pastDue: currentManagedSubscriptions.filter((subscription) => subscription.status === "past_due" || subscription.status === "unpaid").length,
      recovering: currentManagedSubscriptions.filter((subscription) => subscription.status === "paused" || subscription.status === "incomplete").length,
      canceling: currentManagedSubscriptions.filter((subscription) => subscription.cancel_at_period_end).length,
      outsideRange: outsideRange.length,
      totalKnown: supporterSubscriptions.length,
      daily: subscriptionDaily,
    } : null,
    charges: (chargesResult.status === "fulfilled" ? chargesResult.value.data : []).map((charge) => ({
      id: charge.id,
      createdAt: charge.created * 1000,
      amountCents: charge.amount,
      amountRefundedCents: charge.amount_refunded,
      currency: charge.currency,
      status: charge.status,
      customerId: objectId(charge.customer),
      receiptUrl: charge.receipt_url,
      paymentIntentId: objectId(charge.payment_intent),
      description: charge.description,
    })),
    refunds: (refundsResult.status === "fulfilled" ? refundsResult.value.data : []).map((refund) => ({
      id: refund.id,
      createdAt: refund.created * 1000,
      amountCents: refund.amount,
      currency: refund.currency,
      status: refund.status,
      paymentIntentId: objectId(refund.payment_intent),
      reason: refund.reason,
    })),
    invoices: (invoicesResult.status === "fulfilled" ? invoicesResult.value.data : []).map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      createdAt: invoice.created * 1000,
      amountDueCents: invoice.amount_due,
      amountPaidCents: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      customerId: objectId(invoice.customer),
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
    })),
  };
}

export async function setSupporterBillingControls(input: {
  actorId: string;
  minimumAmountCents: number;
  maximumAmountCents: number;
  defaultAmountCents: number;
  subscriberNotice: string | null;
  noticeEffectiveAt: string | null;
}): Promise<SupporterBillingControls> {
  const next = {
    minimumAmountCents: input.minimumAmountCents,
    maximumAmountCents: input.maximumAmountCents,
    defaultAmountCents: input.defaultAmountCents,
  };
  if (!validSupporterBillingControls(next)) throw new Error("invalid_controls");
  const notice = input.subscriberNotice?.trim() || null;
  if (notice && (notice.length < 10 || notice.length > 1000)) throw new Error("invalid_notice");
  const effectiveAt = input.noticeEffectiveAt ? new Date(input.noticeEffectiveAt) : null;
  if (effectiveAt && !Number.isFinite(effectiveAt.getTime())) throw new Error("invalid_notice_date");

  return withTransaction(async (client) => {
    await lockSupporterBillingControls(client);
    const currentResult = await client.query<BillingControlRow>(
      `SELECT minimum_amount_cents, maximum_amount_cents, default_amount_cents,
              subscriber_notice, notice_effective_at, notice_published_at, renewals_disabled_at, updated_at
         FROM supporter_billing_controls WHERE singleton = true FOR UPDATE`,
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("billing_controls_missing");
    const restrictiveChange = input.minimumAmountCents > current.minimum_amount_cents
      || input.maximumAmountCents < current.maximum_amount_cents;
    if (restrictiveChange && !notice) throw new Error("notice_required");
    if (restrictiveChange && !effectiveAt) throw new Error("notice_effective_date_required");
    if (restrictiveChange && effectiveAt!.getTime() < Date.now() + SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS * DAY_MS) {
      throw new Error("notice_period_too_short");
    }

    const update = await client.query<BillingControlRow>(
      `UPDATE supporter_billing_controls
          SET minimum_amount_cents = $1,
              maximum_amount_cents = $2,
              default_amount_cents = $3,
              subscriber_notice = $4,
              notice_effective_at = $5,
              notice_published_at = CASE WHEN $4::text IS NULL THEN NULL ELSE now() END,
              updated_by = $6,
              updated_at = now()
        WHERE singleton = true
        RETURNING minimum_amount_cents, maximum_amount_cents, default_amount_cents,
                  subscriber_notice, notice_effective_at, notice_published_at, renewals_disabled_at, updated_at`,
      [input.minimumAmountCents, input.maximumAmountCents, input.defaultAmountCents, notice, effectiveAt, input.actorId],
    );
    const row = update.rows[0];
    if (!row) throw new Error("billing_controls_missing");
    await client.query(
      `INSERT INTO stripe_finance_audit (actor_id, action, stripe_object_type, stripe_object_id, payload)
       VALUES ($1, 'supporter_controls_updated', 'billing_control', 'supporter', $2::jsonb)`,
      [input.actorId, JSON.stringify({ before: controlsFromRow(current), after: controlsFromRow(row) })],
    );
    return controlsFromRow(row);
  });
}

export async function scheduleOutOfRangeSupporterCancellations(input: { actorId: string }) {
  const controls = await getSupporterBillingControls();
  if (!controls.subscriberNotice || !controls.noticePublishedAt) throw new Error("notice_required");
  if (!controls.noticeEffectiveAt) throw new Error("notice_effective_date_required");
  const publishedAt = Date.parse(controls.noticePublishedAt);
  const effectiveAt = Date.parse(controls.noticeEffectiveAt);
  if (!Number.isFinite(publishedAt) || !Number.isFinite(effectiveAt)) throw new Error("invalid_notice_date");
  if (effectiveAt - publishedAt < SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS * DAY_MS) {
    throw new Error("notice_period_too_short");
  }
  if (effectiveAt > Date.now()) throw new Error("notice_not_effective");
  const stripe = getStripe();
  if (!membershipOperationsConfigured() || !stripe) throw new Error("billing_not_configured");
  const batchId = randomUUID();
  let affected = 0;
  let failed = 0;
  let controlsChanged = false;
  const subscriptions = await listAll<Stripe.Subscription>((startingAfter) => stripe.subscriptions.list({
    status: "all",
    limit: 100,
    ...(startingAfter ? { starting_after: startingAfter } : {}),
  }));
  for (const subscription of subscriptions) {
    if (controlsChanged) break;
    if (!isSupporterSubscription(subscription)) continue;
    const userId = subscription.metadata.user_id;
    if (!userId) { failed += 1; continue; }
    try {
      const changed = await withSupporterBillingLock(userId, async (client) => {
        await lockSupporterBillingControls(client);
        const currentControls = await getSupporterBillingControls(client);
        if (currentControls.updatedAt !== controls.updatedAt) throw new Error("billing_controls_changed");
        const current: Stripe.Subscription = await stripe.subscriptions.retrieve(subscription.id);
        if (!isSupporterSubscription(current) || current.metadata.user_id !== userId || !SUPPORTER_STATUSES.has(current.status) || current.cancel_at_period_end) return false;
        const amountCents = supporterSubscriptionAmount(current);
        if (amountCents != null && amountCents >= controls.minimumAmountCents && amountCents <= controls.maximumAmountCents) return false;
        await stripe.subscriptions.update(current.id, {
          cancel_at_period_end: true,
          metadata: {
            ...current.metadata,
            threshold_cancellation: "true",
            threshold_minimum_cents: String(controls.minimumAmountCents),
            threshold_maximum_cents: String(controls.maximumAmountCents),
          },
        }, { idempotencyKey: `supporter-threshold-cancel:${batchId}:${current.id}` });
        return true;
      });
      if (changed) affected += 1;
    } catch (error) {
      failed += 1;
      if (error instanceof Error && error.message === "billing_controls_changed") controlsChanged = true;
      console.error("[supporter-threshold-cancel] subscription update failed", subscription.id, error);
    }
  }
  await recordAudit({
    actorId: input.actorId,
    action: "supporter_out_of_range_cancellations_scheduled",
    objectType: "subscription_batch",
    objectId: batchId,
    payload: {
      minimumAmountCents: controls.minimumAmountCents,
      maximumAmountCents: controls.maximumAmountCents,
      affected,
      failed,
      controlsChanged,
      cancellationTiming: "period_end",
    },
  });
  return {
    batchId,
    affected,
    failed,
    controlsChanged,
    status: controlsChanged ? "aborted" as const : failed === 0 ? "completed" as const : affected > 0 ? "partial" as const : "failed" as const,
  };
}

export async function scheduleAllSupporterCancellations(input: { actorId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new Error("invalid_shutdown_reason");
  const stripe = getStripe();
  if (!membershipOperationsConfigured() || !stripe) throw new Error("billing_not_configured");
  const batchId = randomUUID();
  const windDownStartedAt = await withTransaction(async (client) => {
    await lockSupporterBillingControls(client);
    const result = await client.query<{ renewals_disabled_at: Date | string }>(
      `UPDATE supporter_billing_controls
          SET renewals_disabled_at = COALESCE(renewals_disabled_at, now()),
              updated_by = $1,
              updated_at = now()
        WHERE singleton = true
        RETURNING renewals_disabled_at`,
      [input.actorId],
    );
    const value = result.rows[0]?.renewals_disabled_at;
    if (!value) throw new Error("billing_controls_missing");
    const startedAt = iso(value);
    await client.query(
      `INSERT INTO stripe_finance_audit (actor_id, action, stripe_object_type, stripe_object_id, payload)
       VALUES ($1, 'supporter_wind_down_started', 'subscription_batch', $2, $3::jsonb)`,
      [input.actorId, batchId, JSON.stringify({ reason, renewalsDisabledAt: startedAt })],
    );
    return startedAt;
  });
  let checkoutSessionsExpired = 0;
  let checkoutSessionsFailed = 0;
  const openCheckoutSessions = await query<{ stripe_session_id: string }>(
    `SELECT stripe_session_id
       FROM supporter_checkout_attempts
      WHERE state = 'open' AND stripe_session_id IS NOT NULL`,
  );
  for (const row of openCheckoutSessions.rows) {
    try {
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id);
        await finishSupporterCheckoutSession(session.id, "expired");
        checkoutSessionsExpired += 1;
      } else if (session.status === "complete") {
        await finishSupporterCheckoutSession(session.id, "completed");
      } else {
        await finishSupporterCheckoutSession(session.id, "expired");
      }
    } catch (error) {
      checkoutSessionsFailed += 1;
      console.error("[supporter-shutdown-cancel] Checkout expiry failed", row.stripe_session_id, error);
    }
  }
  let affected = 0;
  let failed = 0;
  let metadataRepairNeeded = 0;
  let orphanCancellationFailed = 0;
  let subscriptions: Stripe.Subscription[];
  try {
    subscriptions = await listAll<Stripe.Subscription>((startingAfter) => stripe.subscriptions.list({
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    }));
  } catch (error) {
    await recordAudit({
      actorId: input.actorId,
      action: "supporter_wind_down_scan_failed",
      objectType: "subscription_batch",
      objectId: batchId,
      payload: { reason, renewalsDisabledAt: windDownStartedAt },
    }).catch(() => undefined);
    console.error("[supporter-shutdown-cancel] subscription scan failed", error);
    return {
      batchId,
      affected: 0,
      failed: 1,
      metadataRepairNeeded,
      orphanCancellationFailed,
      checkoutSessionsExpired,
      checkoutSessionsFailed,
      status: "partial" as const,
      renewalsDisabledAt: windDownStartedAt,
    };
  }
  for (const subscription of subscriptions) {
    if (!isSupporterSubscription(subscription)) continue;
    const userId = subscription.metadata.user_id;
    if (!userId) metadataRepairNeeded += 1;
    const lockIdentity = userId ?? `orphan-subscription:${subscription.id}`;
    try {
      const changed = await withSupporterBillingLock(lockIdentity, async () => {
        const current: Stripe.Subscription = await stripe.subscriptions.retrieve(subscription.id);
        if (!isSupporterSubscription(current) || !SUPPORTER_STATUSES.has(current.status)) return false;
        if (userId && current.metadata.user_id !== userId) return false;
        if (!userId && current.metadata.user_id) throw new Error("supporter_subscription_identity_changed");
        if (current.cancel_at_period_end && current.metadata.site_shutdown_cancellation === "true") return false;
        await stripe.subscriptions.update(current.id, {
          cancel_at_period_end: true,
          metadata: {
            ...current.metadata,
            site_shutdown_cancellation: "true",
          },
        }, { idempotencyKey: `supporter-shutdown-cancel:${batchId}:${current.id}` });
        return true;
      });
      if (changed) affected += 1;
    } catch (error) {
      failed += 1;
      if (!userId) orphanCancellationFailed += 1;
      console.error("[supporter-shutdown-cancel] subscription update failed", subscription.id, error);
    }
  }
  await recordAudit({
    actorId: input.actorId,
    action: "supporter_all_cancellations_scheduled",
    objectType: "subscription_batch",
    objectId: batchId,
    payload: { reason, affected, failed, metadataRepairNeeded, orphanCancellationFailed, checkoutSessionsExpired, checkoutSessionsFailed, cancellationTiming: "period_end" },
  });
  const totalFailures = failed + checkoutSessionsFailed;
  return {
    batchId,
    affected,
    failed,
    metadataRepairNeeded,
    orphanCancellationFailed,
    checkoutSessionsExpired,
    checkoutSessionsFailed,
    status: totalFailures === 0 ? "completed" as const : affected > 0 || checkoutSessionsExpired > 0 ? "partial" as const : "failed" as const,
    renewalsDisabledAt: windDownStartedAt,
  };
}

export async function refundStripePayment(input: { actorId: string; operationId: string; paymentIntentId: string; amountCents?: number }): Promise<RefundResult> {
  const stripe = getStripe();
  if (!stripe || !membershipOperationsConfigured()) throw new Error("billing_not_configured");
  const reservation = await reserveRefundOperation(input);
  if (reservation.kind === "cached") return reservation.refund;
  if (reservation.kind === "in_progress") {
    const existing = await listAll<Stripe.Refund>((startingAfter) => stripe.refunds.list({
      payment_intent: input.paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    }));
    const recovered = existing.find((refund) => refund.metadata?.supporter_refund_operation_id === input.operationId);
    if (recovered) return completeRefundOperation({ ...input, refund: recovered });
    throw new Error("refund_operation_in_progress");
  }
  await recordAudit({
    actorId: input.actorId,
    action: "stripe_refund_requested",
    objectType: "refund_request",
    objectId: input.operationId,
    payload: { paymentIntentId: input.paymentIntentId, amountCents: input.amountCents ?? null },
  });
  try {
    if (reservation.reconcileFirst) {
      const existing = await listAll<Stripe.Refund>((startingAfter) => stripe.refunds.list({
        payment_intent: input.paymentIntentId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }));
      const recovered = existing.find((refund) => refund.metadata?.supporter_refund_operation_id === input.operationId);
      if (recovered) return completeRefundOperation({ ...input, refund: recovered });
    }
    const refund = await stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        ...(input.amountCents ? { amount: input.amountCents } : {}),
        metadata: { supporter_refund_operation_id: input.operationId },
      },
      { idempotencyKey: `admin-refund:${input.operationId}` },
    );
    return completeRefundOperation({ ...input, refund });
  } catch (error) {
    await query(
      `UPDATE stripe_refund_operations
          SET state = 'failed', lease_expires_at = NULL, last_error = $2, updated_at = now()
        WHERE operation_id = $1::uuid AND state <> 'succeeded'`,
      [input.operationId, error instanceof Error ? error.message.slice(0, 500) : "refund_failed"],
    ).catch(() => undefined);
    throw error;
  }
}
