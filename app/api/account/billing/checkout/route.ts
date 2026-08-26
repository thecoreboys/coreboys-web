import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getFanUserById } from "@/lib/fan-users";
import { getStripe } from "@/lib/stripe";
import { getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import {
  MEMBERSHIP_MAXIMUM_CENTS,
  MEMBERSHIP_MINIMUM_CENTS,
  membershipBillingConfigured,
  publicSiteOrigin,
} from "@/lib/subscriptions/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amountCents: z.number().int().min(MEMBERSHIP_MINIMUM_CENTS).max(MEMBERSHIP_MAXIMUM_CENTS),
});

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!membershipBillingConfigured()) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });

  const state = await getAccountSubscriptionState({ userId, requestHostname: new URL(request.url).hostname });
  if (state.account.storageState !== "ready") {
    return NextResponse.json({ error: "billing_setup_required" }, { status: 503 });
  }
  if (state.account.source === "subscription" && state.account.status !== "canceled") {
    return NextResponse.json({ error: "membership_already_active" }, { status: 409 });
  }

  const [stripe, user] = [getStripe(), await getFanUserById(userId)];
  if (!stripe || !user) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });

  const origin = publicSiteOrigin(request);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    client_reference_id: userId,
    metadata: { kind: "supporter_membership", user_id: userId },
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: parsed.data.amountCents,
        recurring: { interval: "month" },
        product_data: {
          name: "CORE website membership",
          description: "Monthly support for website development, the domain, hosting, databases, and site hardware. Public creator content remains free.",
        },
      },
      quantity: 1,
    }],
    subscription_data: {
      metadata: { kind: "supporter_membership", user_id: userId },
    },
    success_url: `${origin}/account/plan?billing=success`,
    cancel_url: `${origin}/account/plan?billing=canceled`,
    allow_promotion_codes: false,
  }, { idempotencyKey: `supporter-checkout:${userId}:${parsed.data.amountCents}:${Math.floor(Date.now() / 3_600_000)}` });

  if (!session.url) return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  return NextResponse.json({ url: session.url });
}
