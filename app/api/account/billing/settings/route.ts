import { NextResponse } from "next/server";
import { defaultSupporterBillingControls, getSupporterBillingControls, membershipCheckoutConfigured } from "@/lib/subscriptions/billing";

export const dynamic = "force-dynamic";

/** Public checkout bounds only — no customer or payment information. */
export async function GET() {
  try { return NextResponse.json({ ...await getSupporterBillingControls(), checkoutAvailable: membershipCheckoutConfigured() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ...defaultSupporterBillingControls(), checkoutAvailable: false }, { headers: { "Cache-Control": "no-store" } }); }
}
