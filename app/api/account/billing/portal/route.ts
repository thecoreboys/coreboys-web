import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getStripe } from "@/lib/stripe";
import { membershipBillingConfigured, publicSiteOrigin } from "@/lib/subscriptions/billing";
import { getSubscriptionStorageSnapshot } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!membershipBillingConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const snapshot = await getSubscriptionStorageSnapshot(userId);
  const customerId = snapshot.subscription?.externalCustomerRef;
  const stripe = getStripe();
  if (!stripe || !customerId) return NextResponse.json({ error: "no_billing_profile" }, { status: 404 });

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${publicSiteOrigin(request)}/account/plan`,
  });
  return NextResponse.json({ url: portal.url });
}
