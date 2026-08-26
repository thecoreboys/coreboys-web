import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { membershipBillingConfigured } from "@/lib/subscriptions/billing";
import { upsertStripeSubscription } from "@/lib/subscriptions/store";
import type { SubscriptionStatus } from "@/lib/subscriptions/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_STATUSES = new Set<SubscriptionStatus>([
  "active", "trialing", "past_due", "paused", "canceled", "expired", "incomplete",
]);

function asDate(epoch: number | null | undefined): Date | null {
  return typeof epoch === "number" && epoch > 0 ? new Date(epoch * 1000) : null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  if (subscription.metadata.kind !== "supporter_membership") return;
  const userId = subscription.metadata.user_id;
  if (!userId || !KNOWN_STATUSES.has(subscription.status as SubscriptionStatus)) return;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  await upsertStripeSubscription({
    userId,
    customerId,
    subscriptionId: subscription.id,
    status: subscription.status as SubscriptionStatus,
    currentPeriodStart: asDate(subscription.items.data[0]?.current_period_start),
    currentPeriodEnd: asDate(subscription.items.data[0]?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

export async function POST(request: Request) {
  if (!membershipBillingConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  const stripe = getStripe();
  const secret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
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
      if (session.metadata?.kind === "supporter_membership" && typeof session.subscription === "string") {
        await syncSubscription(await stripe.subscriptions.retrieve(session.subscription));
      }
    }
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    console.error("[membership] webhook sync failed", error);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
