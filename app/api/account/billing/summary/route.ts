import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getStripe } from "@/lib/stripe";
import {
  getSupporterBillingControls,
  membershipOperationsConfigured,
} from "@/lib/subscriptions/billing";
import { getSubscriptionStorageSnapshot } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let controls;
  try { controls = await getSupporterBillingControls(); }
  catch { return NextResponse.json({ error: "billing_setup_required" }, { status: 503, headers: privateHeaders }); }
  const publishedNotice = controls.renewalsDisabledAt
    ? {
        kind: "service_shutdown" as const,
        message: "Recurring site support is being discontinued. The wind-down has started; use the Stripe billing portal to verify your period-end cancellation or contact support if it is not yet shown.",
        effectiveAt: controls.renewalsDisabledAt,
      }
    : controls.subscriberNotice
    ? {
        kind: "notice" as const,
        message: controls.subscriberNotice,
        effectiveAt: controls.noticeEffectiveAt,
      }
    : null;
  const stripe = getStripe();
  if (!membershipOperationsConfigured() || !stripe) {
    return NextResponse.json({ configured: false, controls, priceWarning: publishedNotice }, { headers: privateHeaders });
  }
  const snapshot = await getSubscriptionStorageSnapshot(userId);
  const customerId = snapshot.subscription?.externalCustomerRef;
  const subscriptionId = snapshot.subscription?.externalContractRef;
  if (!customerId || !subscriptionId) {
    return NextResponse.json({ configured: true, billingProfile: false, controls, priceWarning: publishedNotice }, { headers: privateHeaders });
  }
  const [methods, invoices, subscription] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 10 }),
    stripe.invoices.list({ customer: customerId, limit: 12 }),
    stripe.subscriptions.retrieve(subscriptionId),
  ]);
  if (subscription.metadata.kind !== "supporter_membership" || subscription.metadata.user_id !== userId) {
    return NextResponse.json({ error: "billing_profile_mismatch" }, { status: 409, headers: privateHeaders });
  }
  const item = subscription.items.data.length === 1 ? subscription.items.data[0] : undefined;
  const currentAmountCents = item && typeof item.price.unit_amount === "number"
    ? item.price.unit_amount * Math.max(1, item.quantity ?? 1)
    : null;
  const currentPeriodEnd = item && typeof item.current_period_end === "number"
    ? new Date(item.current_period_end * 1000).toISOString()
    : snapshot.subscription?.currentPeriodEnd ?? null;
  const outsideRange = currentAmountCents == null
    || currentAmountCents < controls.minimumAmountCents
    || currentAmountCents > controls.maximumAmountCents;
  const thresholdCancellation = subscription.cancel_at_period_end
    && subscription.metadata.threshold_cancellation === "true";
  const serviceWindDown = Boolean(controls.renewalsDisabledAt);
  const serviceShutdownCancellation = subscription.cancel_at_period_end
    && subscription.metadata.site_shutdown_cancellation === "true";
  const generatedThresholdMessage = currentAmountCents == null
    ? `Choose a monthly amount between $${controls.minimumAmountCents / 100} and $${controls.maximumAmountCents / 100} to keep recurring membership active.`
    : `Your current $${currentAmountCents / 100}/month amount is outside the supported $${controls.minimumAmountCents / 100}–$${controls.maximumAmountCents / 100} range.`;
  const thresholdActionMessage = controls.noticeEffectiveAt
    ? "Choose a qualifying monthly amount by the effective date shown; otherwise, recurring support may be scheduled to end after your current paid period."
    : "Choose a qualifying monthly amount; otherwise, recurring support may be scheduled to end after your current paid period.";
  const priceWarning = serviceWindDown
    ? {
        kind: "service_shutdown" as const,
        message: serviceShutdownCancellation
          ? "Recurring site support is being discontinued. Your subscription is scheduled to end after the current paid period and will not renew."
          : "Recurring site support is being discontinued. Your period-end cancellation is still being reconciled with Stripe; use the billing portal to verify it or contact support if it remains unscheduled.",
        effectiveAt: serviceShutdownCancellation ? currentPeriodEnd : controls.renewalsDisabledAt,
      }
    : thresholdCancellation
    ? {
        kind: "cancellation_scheduled" as const,
        message: controls.subscriberNotice ?? generatedThresholdMessage,
        effectiveAt: controls.noticeEffectiveAt,
      }
    : outsideRange
      ? {
          kind: "outside_range" as const,
          message: `${controls.subscriberNotice ?? generatedThresholdMessage} ${thresholdActionMessage}`,
          effectiveAt: controls.noticeEffectiveAt,
        }
      : publishedNotice;

  return NextResponse.json({
    configured: true,
    billingProfile: true,
    controls,
    currentAmountCents,
    subscriptionStatus: subscription.status,
    canUpdateAmount: !serviceWindDown
      && ["active", "trialing", "past_due", "paused"].includes(subscription.status)
      && (!subscription.cancel_at_period_end || thresholdCancellation),
    nextChargeAt: currentPeriodEnd,
    cancellationScheduled: subscription.cancel_at_period_end,
    thresholdCancellation: thresholdCancellation && !serviceWindDown,
    serviceWindDown,
    serviceShutdownCancellation,
    priceWarning,
    cards: methods.data.map((method) => ({
      id: method.id,
      brand: method.card?.brand ?? "card",
      last4: method.card?.last4 ?? "",
      expMonth: method.card?.exp_month ?? null,
      expYear: method.card?.exp_year ?? null,
    })),
    invoices: invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      createdAt: invoice.created * 1000,
      amountPaidCents: invoice.amount_paid,
      amountDueCents: invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
    })),
  }, { headers: privateHeaders });
}
