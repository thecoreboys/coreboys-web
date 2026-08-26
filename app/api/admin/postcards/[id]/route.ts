import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { fulfillOrder } from "@/lib/postcard-fulfill";
import {
  approvePostcardOrderReview,
  claimPostcardOrderRefund,
  restorePostcardOrderReview,
  setOrderStatus,
} from "@/lib/postcard-store";
import { getStripe } from "@/lib/stripe";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Params = z.object({ id: z.string().uuid() });
const PatchBody = z.object({ action: z.enum(["approve", "reject"]) }).strict();
const ACCEPTED_FULFILLMENT_STATUSES = new Set([
  "fulfilling",
  "proof",
  "printing",
  "mailed",
  "sent",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  }

  const parsedParams = Params.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "invalid order id" }, { status: 400 });
  }

  const parsedBody = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const { id } = parsedParams.data;

  if (parsedBody.data.action === "approve") {
    const order = await approvePostcardOrderReview(id, auth.email);
    if (!order) {
      return NextResponse.json(
        { error: "This postcard is no longer awaiting review." },
        { status: 409 },
      );
    }
    if (!order.stripePaymentIntent) {
      await restorePostcardOrderReview(id);
      return NextResponse.json(
        { error: "The paid order is missing its payment reference." },
        { status: 409 },
      );
    }

    const result = await fulfillOrder(order, {
      verifiedPaymentIntentId: order.stripePaymentIntent,
    });
    const acceptedElsewhere = ACCEPTED_FULFILLMENT_STATUSES.has(result.status);
    if (!result.ok && !acceptedElsewhere) {
      if (result.status === "failed") {
        const stripe = getStripe();
        if (!stripe) {
          await restorePostcardOrderReview(id);
          return NextResponse.json(
            { error: "The approved order could not be safely submitted and Stripe is unavailable for the required refund. The order is back in review." },
            { status: 503 },
          );
        }
        try {
          await stripe.refunds.create(
            {
              payment_intent: order.stripePaymentIntent,
              metadata: {
                postcard_order_id: order.id,
                review_action: "permanent_fulfillment_failure",
              },
            },
            { idempotencyKey: `postcard-fulfillment-failed:${order.id}` },
          );
          await setOrderStatus(order.id, "refunded");
          return NextResponse.json({
            ok: true,
            status: "refunded",
            disposition: "permanent-failure",
          });
        } catch (refundError) {
          console.error(`[postcard] permanent-failure refund failed for ${order.id}`, refundError);
          await restorePostcardOrderReview(id);
          return NextResponse.json(
            { error: "The approved order could not be safely submitted and the automatic refund failed. The order is back in review." },
            { status: 502 },
          );
        }
      }
      return NextResponse.json(
        { error: "The artwork is approved, but the mail provider did not confirm acceptance. It remains in the recovery queue for an idempotent retry." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, status: result.status });
  }

  const order = await claimPostcardOrderRefund(id, auth.email);
  if (!order) {
    return NextResponse.json(
      { error: "This postcard is no longer awaiting review." },
      { status: 409 },
    );
  }
  if (!order.stripePaymentIntent) {
    await restorePostcardOrderReview(id);
    return NextResponse.json(
      { error: "The paid order is missing its payment reference." },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    await restorePostcardOrderReview(id);
    return NextResponse.json(
      { error: "Stripe refunds are not configured in this environment." },
      { status: 503 },
    );
  }

  try {
    await stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntent,
        metadata: {
          postcard_order_id: order.id,
          review_action: "declined_custom_art",
        },
      },
      { idempotencyKey: `postcard-review-reject:${order.id}` },
    );
    await setOrderStatus(order.id, "refunded");
    return NextResponse.json({ ok: true, status: "refunded" });
  } catch (error) {
    console.error(`[postcard] refund failed for reviewed order ${order.id}`, error);
    await restorePostcardOrderReview(order.id);
    return NextResponse.json(
      { error: "Stripe could not complete the refund. The postcard is back in review so you can retry." },
      { status: 502 },
    );
  }
}
