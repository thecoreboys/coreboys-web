import "server-only";

import type Stripe from "stripe";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { getSupporterBillingControls, lockSupporterBillingControls, membershipOperationsConfigured, supporterAmountAllowed, SUPPORTER_TERMS_VERSION } from "@/lib/subscriptions/billing";
import { getSubscriptionStorageSnapshot, withSupporterBillingLock } from "@/lib/subscriptions/store";

const MUTABLE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due", "paused"]);

export async function getAccountSupporterSubscription(userId: string): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe || !membershipOperationsConfigured()) return null;
  const snapshot = await getSubscriptionStorageSnapshot(userId);
  const subscriptionId = snapshot.subscription?.externalContractRef;
  if (!subscriptionId) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata.kind !== "supporter_membership" || subscription.metadata.user_id !== userId) {
    throw new Error("subscription_owner_mismatch");
  }
  return subscription;
}

export function accountSupporterAmount(subscription: Stripe.Subscription): number | null {
  if (subscription.items.data.length !== 1) return null;
  const item = subscription.items.data[0];
  return item && typeof item.price.unit_amount === "number"
    ? item.price.unit_amount * Math.max(1, item.quantity ?? 1)
    : null;
}

export async function updateAccountSupporterAmount(input: { userId: string; amountCents: number; operationId: string; termsAccepted: true }) {
  const stripe = getStripe();
  if (!stripe || !membershipOperationsConfigured()) throw new Error("billing_not_configured");
  const acceptedAt = new Date().toISOString();
  const consentPayload = {
    operationId: input.operationId,
    amountCents: input.amountCents,
    currency: "usd",
    interval: "month",
    termsVersion: SUPPORTER_TERMS_VERSION,
    termsAccepted: input.termsAccepted,
    acceptedAt,
    prorationBehavior: "none",
  };

  await query(
    `INSERT INTO fan_subscription_events (user_id, event_type, actor_type, payload)
     VALUES ($1, 'supporter_amount_selection_requested', 'account', $2::jsonb)`,
    [input.userId, JSON.stringify(consentPayload)],
  );

  const result = await withSupporterBillingLock(input.userId, async (client) => {
    let subscriptionId: string | null = null;
    try {
      await lockSupporterBillingControls(client);
      const controls = await getSupporterBillingControls(client);
      if (controls.renewalsDisabledAt) throw new Error("membership_discontinued");
      if (!supporterAmountAllowed(input.amountCents, controls)) throw new Error("invalid_amount");
      subscriptionId = (await client.query<{ external_contract_ref: string | null }>(
        `SELECT external_contract_ref FROM fan_subscriptions WHERE user_id = $1`,
        [input.userId],
      )).rows[0]?.external_contract_ref ?? null;
      if (!subscriptionId) throw new Error("no_billing_profile");
      const subscription: Stripe.Subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata.kind !== "supporter_membership" || subscription.metadata.user_id !== input.userId) {
        throw new Error("subscription_owner_mismatch");
      }
      if (!MUTABLE_STATUSES.has(subscription.status)) throw new Error("subscription_not_editable");
      if (subscription.cancel_at_period_end && subscription.metadata.threshold_cancellation !== "true") {
        throw new Error("subscription_not_editable");
      }
      const item = subscription.items.data.length === 1 ? subscription.items.data[0] : undefined;
      const productId = item && (typeof item.price.product === "string" ? item.price.product : item.price.product.id);
      if (!item || !productId) throw new Error("subscription_not_editable");

      await stripe.subscriptionItems.update(item.id, {
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          recurring: { interval: "month" },
          product: productId,
        },
        quantity: 1,
        proration_behavior: "none",
      }, { idempotencyKey: `supporter-self-update:${input.operationId}` });

      let cancellationRemoved = false;
      const afterAmount: Stripe.Subscription = await stripe.subscriptions.retrieve(subscription.id);
      if (afterAmount.cancel_at_period_end
        && afterAmount.metadata.threshold_cancellation === "true"
        && afterAmount.metadata.site_shutdown_cancellation !== "true") {
        await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: false,
          metadata: {
            threshold_cancellation: "",
            threshold_minimum_cents: "",
            threshold_maximum_cents: "",
          },
        }, { idempotencyKey: `supporter-threshold-reactivate:${input.operationId}` });
        cancellationRemoved = true;
      }

      await client.query(
        `INSERT INTO fan_subscription_events (user_id, event_type, actor_type, payload)
         VALUES ($1, 'supporter_amount_selection_completed', 'system', $2::jsonb)`,
        [input.userId, JSON.stringify({ ...consentPayload, subscriptionId })],
      );
      return { ok: true as const, value: { subscriptionId, amountCents: input.amountCents, cancellationRemoved } };
    } catch (error) {
      await client.query(
        `INSERT INTO fan_subscription_events (user_id, event_type, actor_type, payload)
         VALUES ($1, 'supporter_amount_selection_failed', 'system', $2::jsonb)`,
        [input.userId, JSON.stringify({ ...consentPayload, subscriptionId, error: "provider_or_validation_failure" })],
      );
      return { ok: false as const, error };
    }
  });
  if (!result.ok) throw result.error;
  return result.value;
}
