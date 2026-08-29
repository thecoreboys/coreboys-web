import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { finishSupporterCheckoutSession } from "@/lib/supporter-checkout";
import {
  getSupporterBillingControls,
  lockSupporterBillingControls,
  membershipOperationsConfigured,
  SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
  type SupporterBillingControls,
} from "@/lib/subscriptions/billing";
import { upsertStripeSubscription, withSupporterBillingLock } from "@/lib/subscriptions/store";
import type { SubscriptionStatus } from "@/lib/subscriptions/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const TERMINAL_STRIPE_STATUSES = new Set<Stripe.Subscription.Status>(["canceled", "incomplete_expired"]);

function localStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "incomplete_expired") return "expired";
  if (status === "unpaid") return "past_due";
  return status;
}

function asDate(epoch: number | null | undefined): Date | null {
  return typeof epoch === "number" && epoch > 0 ? new Date(epoch * 1000) : null;
}

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function supporterAmount(subscription: Stripe.Subscription): number | null {
  if (subscription.items.data.length !== 1) return null;
  const item = subscription.items.data[0];
  return item && typeof item.price.unit_amount === "number"
    ? item.price.unit_amount * Math.max(1, item.quantity ?? 1)
    : null;
}

function eventPriority(type: Stripe.Event.Type): number {
  if (type === "customer.subscription.deleted") return 40;
  if (type === "customer.subscription.updated") return 30;
  if (type === "checkout.session.completed") return 20;
  if (type === "customer.subscription.created") return 10;
  return 0;
}

function checkoutAttemptId(subscription: Stripe.Subscription, checkout?: Stripe.Checkout.Session): string | null {
  const value = subscription.metadata.checkout_attempt_id ?? checkout?.metadata?.checkout_attempt_id ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

async function enforceMatureThreshold(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  eventId: string,
  controls: SupporterBillingControls,
): Promise<Stripe.Subscription> {
  if (TERMINAL_STRIPE_STATUSES.has(subscription.status)) return subscription;
  if (controls.renewalsDisabledAt || subscription.metadata.site_shutdown_cancellation === "true") {
    if (subscription.cancel_at_period_end && subscription.metadata.site_shutdown_cancellation === "true") return subscription;
    return stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
      metadata: { ...subscription.metadata, site_shutdown_cancellation: "true" },
    }, { idempotencyKey: `supporter-shutdown-webhook:${eventId}` });
  }
  if (subscription.cancel_at_period_end) return subscription;
  const publishedAt = Date.parse(controls.noticePublishedAt ?? "");
  const effectiveAt = Date.parse(controls.noticeEffectiveAt ?? "");
  const noticeMature = Boolean(
    controls.subscriberNotice
    && Number.isFinite(publishedAt)
    && Number.isFinite(effectiveAt)
    && effectiveAt - publishedAt >= SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS * DAY_MS
    && effectiveAt <= Date.now(),
  );
  const amountCents = supporterAmount(subscription);
  const outsideRange = amountCents == null
    || amountCents < controls.minimumAmountCents
    || amountCents > controls.maximumAmountCents;
  if (!noticeMature || !outsideRange) return subscription;
  return stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
    metadata: {
      ...subscription.metadata,
      threshold_cancellation: "true",
      threshold_minimum_cents: String(controls.minimumAmountCents),
      threshold_maximum_cents: String(controls.maximumAmountCents),
    },
  }, { idempotencyKey: `supporter-threshold-webhook:${eventId}` });
}

async function syncSubscription(input: {
  stripe: Stripe;
  subscriptionId: string;
  event: Stripe.Event;
  checkout?: Stripe.Checkout.Session;
}): Promise<boolean> {
  const candidate: Stripe.Subscription = await input.stripe.subscriptions.retrieve(input.subscriptionId);
  if (candidate.metadata.kind !== "supporter_membership") return false;
  const userId = candidate.metadata.user_id;
  if (!userId) throw new Error("supporter_subscription_user_metadata_missing");
  return withSupporterBillingLock(userId, async (client) => {
    let subscription: Stripe.Subscription = await input.stripe.subscriptions.retrieve(input.subscriptionId);
    if (subscription.metadata.kind !== "supporter_membership" || subscription.metadata.user_id !== userId) return false;
    await lockSupporterBillingControls(client);
    const controls = await getSupporterBillingControls(client);
    subscription = await enforceMatureThreshold(input.stripe, subscription, input.event.id, controls);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const item = subscription.items.data[0];
    const projection = await upsertStripeSubscription({
      userId,
      customerId,
      subscriptionId: subscription.id,
      status: localStatus(subscription.status),
      currentPeriodStart: asDate(item?.current_period_start),
      currentPeriodEnd: asDate(item?.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      providerEventId: input.event.id,
      providerEventCreatedAt: new Date(input.event.created * 1000),
      providerEventPriority: eventPriority(input.event.type),
      allowContractReplace: input.event.type === "checkout.session.completed"
        || input.event.type === "customer.subscription.created",
      checkoutAttemptId: checkoutAttemptId(subscription, input.checkout),
      billingConsent: input.checkout ? {
        termsVersion: subscription.metadata.terms_version ?? input.checkout.metadata?.terms_version ?? "unknown",
        termsAccepted: input.checkout.consent?.terms_of_service === "accepted"
          || input.checkout.metadata?.terms_accepted === "true"
          || subscription.metadata.terms_accepted === "true",
        amountCents: supporterAmount(subscription),
        currency: item?.price.currency ?? null,
        interval: item?.price.recurring?.interval ?? null,
        acceptedAt: new Date(input.event.created * 1000),
      } : undefined,
    }, client);
    return projection.contractMatched;
  });
}

export async function POST(request: Request) {
  if (!membershipOperationsConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  const stripe = getStripe();
  const secret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = objectId(session.subscription);
      if (session.metadata?.kind === "supporter_membership" && subscriptionId) {
        const synced = await syncSubscription({ stripe, subscriptionId, event, checkout: session });
        if (!synced) throw new Error("checkout_subscription_metadata_mismatch");
        await finishSupporterCheckoutSession(session.id, "completed");
      }
    }
    if (event.type === "checkout.session.expired") {
      await finishSupporterCheckoutSession((event.data.object as Stripe.Checkout.Session).id, "expired");
    }
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription({ stripe, subscriptionId: (event.data.object as Stripe.Subscription).id, event });
    }
  } catch (error) {
    console.error("[membership] webhook sync failed", error);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
