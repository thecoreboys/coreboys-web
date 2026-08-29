import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { updateAccountSupporterAmount } from "@/lib/supporter-billing-account";
import {
  getSupporterBillingControls,
  membershipOperationsConfigured,
  supporterAmountAllowed,
} from "@/lib/subscriptions/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ amountCents: z.number().int(), termsAccepted: z.literal(true), operationId: z.string().uuid() });

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!membershipOperationsConfigured()) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
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
  try {
    return NextResponse.json(await updateAccountSupporterAmount({
      userId,
      amountCents: parsed.data.amountCents,
      operationId: parsed.data.operationId,
      termsAccepted: parsed.data.termsAccepted,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "billing_unavailable";
    const status = message === "membership_discontinued"
      ? 410
      : message === "no_billing_profile" || message === "subscription_not_editable" || message === "billing_operation_in_progress" || message === "billing_controls_busy"
        ? 409
        : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
