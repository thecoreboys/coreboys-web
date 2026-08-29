import { NextResponse } from "next/server";
import { defaultSupporterBillingControls, getSupporterBillingControls } from "@/lib/subscriptions/billing";

export const dynamic = "force-dynamic";

/** Public checkout bounds only — no customer or payment information. */
export async function GET() {
  try { return NextResponse.json(await getSupporterBillingControls(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json(defaultSupporterBillingControls(), { headers: { "Cache-Control": "no-store" } }); }
}
