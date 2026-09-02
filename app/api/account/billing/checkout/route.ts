import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getFanUserById } from "@/lib/fan-users";
import { getStripe } from "@/lib/stripe";
import { withTransaction } from "@/lib/db";
import { getAccountSupporterSubscription } from "@/lib/supporter-billing-account";
import {
  failSupporterCheckout,
  finishSupporterCheckoutSession,
  openSupporterCheckout,
  reserveSupporterCheckout,
} from "@/lib/supporter-checkout";
import { getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import {
  getSupporterBillingControls,
  lockSupporterBillingControls,
  membershipCheckoutConfigured,
  publicSiteOrigin,
  supporterAmountAllowed,
  SUPPORTER_TERMS_VERSION,
} from "@/lib/subscriptions/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amountCents: z.number().int(),
  termsAccepted: z.literal(true),
});

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!membershipCheckoutConfigured()) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  let controls;
  try { controls = await getSupporterBillingControls(); }
  catch { return NextResponse.json({ error: "billing_setup_required" }, { status: 503 }); }
  if (controls.renewalsDisabledAt) {
    return NextResponse.json({ error: "membership_discontinued" }, { status: 410 });
  }
  if (!supporterAmountAllowed(parsed.data.amountCents, controls)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const state = await getAccountSubscriptionState({ userId, requestHostname: new URL(request.url).hostname });
  if (state.account.storageState !== "ready") {
    return NextResponse.json({ error: "billing_setup_required" }, { status: 503 });
  }
  if (state.account.hasManagedSubscription) {
    return NextResponse.json({ error: "membership_already_active" }, { status: 409 });
  }

  const [stripe, user] = [getStripe(), await getFanUserById(userId)];
  if (!stripe || !user) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });

  let priorCustomerId: string | null = null;
  try {
    const existing = await getAccountSupporterSubscription(userId);
    if (existing && existing.status !== "canceled" && existing.status !== "incomplete_expired") {
      return NextResponse.json({ error: "membership_already_active" }, { status: 409 });
    }
    if (existing) {
      const customerId = typeof existing.customer === "string" ? existing.customer : existing.customer.id;
      const customer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in customer) || !customer.deleted) priorCustomerId = customer.id;
    }
  } catch {
    return NextResponse.json({ error: "billing_profile_mismatch" }, { status: 409 });
  }

  let reservation;
  try {
    reservation = await reserveSupporterCheckout({
      userId,
      amountCents: parsed.data.amountCents,
      creatingExpiresAt: new Date(Date.now() + 2 * 60_000),
    });
  } catch {
    return NextResponse.json({ error: "billing_setup_required" }, { status: 503 });
  }
  if (reservation.kind === "reconcile") {
    try {
      const priorSession = await stripe.checkout.sessions.retrieve(reservation.sessionId);
      if (priorSession.status === "expired") {
        await finishSupporterCheckoutSession(priorSession.id, "expired");
        reservation = await reserveSupporterCheckout({
          userId,
          amountCents: parsed.data.amountCents,
          creatingExpiresAt: new Date(Date.now() + 2 * 60_000),
        });
      } else if (priorSession.status === "complete") {
        return NextResponse.json({ error: "membership_sync_pending" }, { status: 409 });
      } else {
        return NextResponse.json({ error: "checkout_in_progress" }, { status: 409 });
      }
    } catch {
      return NextResponse.json({ error: "billing_profile_mismatch" }, { status: 409 });
    }
  }
  if (reservation.kind === "reused") return NextResponse.json({ url: reservation.url, reused: true });
  if (reservation.kind === "busy") {
    return NextResponse.json({ error: "checkout_in_progress" }, { status: 409 });
  }
  if (reservation.kind === "reconcile") {
    return NextResponse.json({ error: "membership_sync_pending" }, { status: 409 });
  }

  const origin = publicSiteOrigin(request);
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 31 * 60;
  let createdSessionId: string | null = null;
  try {
    const outcome = await withTransaction(async (client): Promise<{ url: string } | { error: string; status: number }> => {
      await lockSupporterBillingControls(client);
      const latestControls = await getSupporterBillingControls(client);
      if (latestControls.renewalsDisabledAt) {
        await failSupporterCheckout(userId, reservation.attemptId, client);
        return { error: "membership_discontinued", status: 410 };
      }
      if (!supporterAmountAllowed(parsed.data.amountCents, latestControls)) {
        await failSupporterCheckout(userId, reservation.attemptId, client);
        return { error: "invalid_amount", status: 400 };
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        ...(priorCustomerId ? { customer: priorCustomerId } : { customer_email: user.email }),
        client_reference_id: userId,
        expires_at: expiresAtSeconds,
        metadata: {
          kind: "supporter_membership",
          user_id: userId,
          terms_version: SUPPORTER_TERMS_VERSION,
          terms_accepted: "true",
          recurring_amount_cents: String(parsed.data.amountCents),
          recurring_interval: "month",
          checkout_attempt_id: reservation.attemptId,
        },
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: parsed.data.amountCents,
            recurring: { interval: "month" },
            product_data: {
              name: "CORE site support",
              description: "Recurring monthly support for the independent website: hosting, databases, API usage, and development. Cancel recurring billing anytime.",
            },
          },
          quantity: 1,
        }],
        subscription_data: {
          metadata: {
            kind: "supporter_membership",
            user_id: userId,
            terms_version: SUPPORTER_TERMS_VERSION,
            terms_accepted: "true",
            recurring_amount_cents: String(parsed.data.amountCents),
            recurring_interval: "month",
            checkout_attempt_id: reservation.attemptId,
          },
        },
        custom_text: {
          submit: { message: `You authorize a recurring $${(parsed.data.amountCents / 100).toFixed(2)} monthly charge until you cancel.` },
        },
        success_url: `${origin}/account/plan?billing=success`,
        cancel_url: `${origin}/account/plan?billing=canceled`,
        allow_promotion_codes: false,
      }, { idempotencyKey: `supporter-checkout:${reservation.attemptId}` });
      createdSessionId = session.id;

      if (!session.url) throw new Error("checkout_unavailable");
      await openSupporterCheckout({
        userId,
        attemptId: reservation.attemptId,
        amountCents: parsed.data.amountCents,
        sessionId: session.id,
        sessionUrl: session.url,
        expiresAt: new Date(session.expires_at * 1000),
      }, client);
      return { url: session.url };
    });
    if ("error" in outcome) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ url: outcome.url });
  } catch (error) {
    console.error("[supporter-checkout] session creation failed", {
      code: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown",
    });
    if (createdSessionId) await stripe.checkout.sessions.expire(createdSessionId).catch(() => undefined);
    await failSupporterCheckout(userId, reservation.attemptId).catch(() => undefined);
    const code = error instanceof Error && error.message === "billing_controls_busy"
      ? "billing_controls_busy"
      : "billing_unavailable";
    return NextResponse.json({ error: code }, { status: code === "billing_controls_busy" ? 409 : 503 });
  }
}
