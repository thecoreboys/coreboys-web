import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  getBillingDesk,
  refundStripePayment,
  scheduleAllSupporterCancellations,
  scheduleOutOfRangeSupporterCancellations,
  setSupporterBillingControls,
} from "@/lib/supporter-billing-admin";

const NoticeFields = {
  subscriberNotice: z.string().trim().min(10).max(1000).nullable(),
  noticeEffectiveAt: z.string().datetime({ offset: true }).nullable(),
};
const ControlsBody = z.object({
  action: z.literal("set_controls"),
  minimumAmountCents: z.number().int().min(500).max(50_000),
  maximumAmountCents: z.number().int().min(500).max(50_000),
  defaultAmountCents: z.number().int().min(500).max(50_000),
  ...NoticeFields,
}).superRefine((value, context) => {
  if (value.minimumAmountCents > value.defaultAmountCents || value.defaultAmountCents > value.maximumAmountCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The default must be inside the minimum and maximum.", path: ["defaultAmountCents"] });
  }
});
const CancellationBody = z.object({ action: z.literal("cancel_out_of_range"), confirmation: z.literal("CANCEL OUT OF RANGE") });
const ShutdownBody = z.object({ action: z.literal("cancel_all_supporters"), reason: z.string().trim().min(10).max(500), confirmation: z.literal("CANCEL ALL SUPPORTERS") });
const RefundBody = z.object({ action: z.literal("refund"), operationId: z.string().uuid(), paymentIntentId: z.string().regex(/^pi_/), amountCents: z.number().int().positive().optional(), confirmation: z.literal("REFUND") });
const Body = z.union([ControlsBody, CancellationBody, ShutdownBody, RefundBody]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try { return NextResponse.json(await getBillingDesk(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Billing controls are unavailable. Apply migration 035 and configure Stripe first." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid financial action." }, { status: 400 });
  try {
    if (parsed.data.action === "set_controls") {
      const controls = await setSupporterBillingControls({
        actorId: auth.id,
        minimumAmountCents: parsed.data.minimumAmountCents,
        maximumAmountCents: parsed.data.maximumAmountCents,
        defaultAmountCents: parsed.data.defaultAmountCents,
        subscriberNotice: parsed.data.subscriberNotice,
        noticeEffectiveAt: parsed.data.noticeEffectiveAt,
      });
      return NextResponse.json({ controls });
    }
    if (parsed.data.action === "cancel_out_of_range") {
      return NextResponse.json(await scheduleOutOfRangeSupporterCancellations({ actorId: auth.id }));
    }
    if (parsed.data.action === "cancel_all_supporters") {
      return NextResponse.json(await scheduleAllSupporterCancellations({ actorId: auth.id, reason: parsed.data.reason }));
    }
    const refund = await refundStripePayment({ actorId: auth.id, operationId: parsed.data.operationId, paymentIntentId: parsed.data.paymentIntentId, amountCents: parsed.data.amountCents });
    return NextResponse.json({ refund: { id: refund.id, amountCents: refund.amount, status: refund.status } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Financial action failed.";
    const badRequest = new Set([
      "invalid_amount",
      "invalid_controls",
      "invalid_notice",
      "invalid_notice_date",
      "notice_required",
      "notice_effective_date_required",
      "notice_period_too_short",
      "notice_not_effective",
      "invalid_shutdown_reason",
    ]);
    const conflict = new Set(["billing_controls_busy", "refund_operation_in_progress", "refund_operation_mismatch"]);
    return NextResponse.json({ error: message }, { status: badRequest.has(message) ? 400 : conflict.has(message) ? 409 : 503 });
  }
}
