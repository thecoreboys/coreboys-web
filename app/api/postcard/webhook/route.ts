import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  getOrderByPaymentIntent,
  getPostcardOrder,
  markPostcardOrderForReview,
  markPostcardOrderPaid,
  setOrderStatus,
  type PostcardOrder,
} from "@/lib/postcard-store";
import { fulfillOrder } from "@/lib/postcard-fulfill";
import { resolvePostcardProviderMode } from "@/lib/postcard-mode";
import { confirmPostcardCollectibleReservation } from "@/lib/postcard-collectible-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook catcher. On `payment_intent.succeeded` we verify the
 * payment, mark the order paid, and hand it to the print provider. The
 * signature is verified against STRIPE_WEBHOOK_SECRET using the RAW body.
 *
 * Configure in Stripe: add an endpoint to {SITE}/api/postcard/webhook
 * subscribed to `payment_intent.succeeded`, and set STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const configuration = resolvePostcardProviderMode();
  if (!configuration.ok || configuration.mode === "sandbox") {
    if (!configuration.ok) console.error("[postcard] invalid provider configuration:", configuration.reason);
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text(); // raw body required for signature verification

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("[postcard] webhook signature verify failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    try {
      const order = await getOrderByPaymentIntent(pi.id);
      if (!order) return NextResponse.json({ received: true });

      const paymentMatchesOrder = pi.status === "succeeded"
        && pi.amount_received === order.amountCents
        && pi.currency.toLowerCase() === order.currency.toLowerCase()
        && pi.metadata.orderId === order.id
        && pi.metadata.kind === "postcard"
        && pi.metadata.recipient === order.recipientSlug
        && pi.metadata.providerMode === configuration.mode
        && pi.livemode === (configuration.mode === "live")
        && order.providerMode === configuration.mode;
      if (!paymentMatchesOrder) {
        console.error(`[postcard] verified PaymentIntent ${pi.id} did not match order ${order.id}`);
        return NextResponse.json({ received: true });
      }

      const collectibleReservation = await confirmPostcardCollectibleReservation(
        order.id,
        order.fanUserId,
      );
      if (collectibleReservation === "unavailable") {
        if (order.status === "created") await markPostcardOrderPaid(order.id);
        await refundPermanentlyFailedOrder(stripe, order);
        return NextResponse.json({ received: true, status: "refunded" });
      }

      if (order.status === "created") await markPostcardOrderPaid(order.id);
      const current = await getPostcardOrder(order.id);
      if (!current) {
        return NextResponse.json({ error: "Order lookup failed." }, { status: 503 });
      }

      if (current.status === "failed") {
        await refundPermanentlyFailedOrder(stripe, current);
        return NextResponse.json({ received: true, status: "refunded" });
      }

      // Uploaded artwork is normalized before checkout, but visual safety
      // cannot be established from file decoding alone. Paid custom-art
      // orders wait for an authenticated human decision; declines are
      // refunded and never reach Lob.
      if (current.status === "paid" && current.hasCustomArt) {
        await markPostcardOrderForReview(current.id);
        return NextResponse.json({ received: true, status: "review" });
      }

      if (current.status === "paid" || current.status === "fulfilling") {
        const result = await fulfillOrder(current, { verifiedPaymentIntentId: pi.id });
        if (!result.ok && result.status === "failed") {
          await refundPermanentlyFailedOrder(stripe, current);
          return NextResponse.json({ received: true, status: "refunded" });
        }
        if (!result.ok && result.status !== "failed") {
          return NextResponse.json(
            { error: "Print provider is temporarily unavailable." },
            { status: 503 },
          );
        }
      }
    } catch (err) {
      console.error("[postcard] fulfilment error", err);
      return NextResponse.json(
        { error: "Postcard processing is temporarily unavailable." },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({ received: true });
}

async function refundPermanentlyFailedOrder(
  stripe: NonNullable<ReturnType<typeof getStripe>>,
  order: PostcardOrder,
): Promise<void> {
  if (!order.stripePaymentIntent) throw new Error("Paid postcard is missing its payment reference.");
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
}
