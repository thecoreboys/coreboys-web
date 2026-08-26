"use client";

import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/base/buttons/button";
import { formatPrice } from "@/lib/postcard";

/**
 * Embedded Stripe Elements checkout — keeps the fan on-site (no redirect).
 * Mounted only once create-intent returns a clientSecret (live Stripe).
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
export const POSTCARD_CHECKOUT_CONTEXT_KEY = "core.postcard.checkout.v1";
const CHECKOUT_CONTEXT_TTL_MS = 60 * 60 * 1000;

export type PostcardCheckoutContext = {
  orderId: string;
  statusToken: string;
  recipientSlug: string;
  amountCents: number;
  clientSecret: string;
  expiresAt: number;
};

export function readPostcardCheckoutContext(): PostcardCheckoutContext | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(POSTCARD_CHECKOUT_CONTEXT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PostcardCheckoutContext>;
    if (
      typeof value.orderId !== "string"
      || !isOrderId(value.orderId)
      || typeof value.statusToken !== "string"
      || !isStatusToken(value.statusToken)
      || typeof value.recipientSlug !== "string"
      || !/^[a-z0-9-]{1,60}$/.test(value.recipientSlug)
      || !Number.isSafeInteger(value.amountCents)
      || value.amountCents! <= 0
      || value.amountCents! > 100_000
      || typeof value.clientSecret !== "string"
      || !isPaymentIntentClientSecret(value.clientSecret)
      || typeof value.expiresAt !== "number"
      || value.expiresAt <= Date.now()
    ) {
      globalThis.sessionStorage.removeItem(POSTCARD_CHECKOUT_CONTEXT_KEY);
      return null;
    }
    return value as PostcardCheckoutContext;
  } catch {
    return null;
  }
}

export function clearPostcardCheckoutContext(orderId?: string): void {
  try {
    if (orderId) {
      const current = readPostcardCheckoutContext();
      if (current && current.orderId !== orderId) return;
    }
    globalThis.sessionStorage?.removeItem(POSTCARD_CHECKOUT_CONTEXT_KEY);
  } catch {
    /* Storage can be disabled without breaking checkout. */
  }
}

// Memoize across mounts.
let _stripePromise: Promise<Stripe | null> | null = null;
function stripePromise(): Promise<Stripe | null> {
  if (!_stripePromise) _stripePromise = loadStripe(PUBLISHABLE_KEY ?? "");
  return _stripePromise;
}

export function PostcardCheckout({
  clientSecret,
  orderId,
  statusToken,
  recipientSlug,
  amountCents,
  onPaid,
  onCancel,
}: {
  clientSecret: string;
  orderId: string;
  statusToken: string;
  recipientSlug: string;
  amountCents: number;
  onPaid: () => void;
  onCancel: () => void;
}) {
  return (
    <Elements
      stripe={stripePromise()}
      options={{
        clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#db0368",
            borderRadius: "10px",
            fontFamily: "Inter, system-ui, sans-serif",
          },
        },
      }}
    >
      <CheckoutForm
        clientSecret={clientSecret}
        orderId={orderId}
        statusToken={statusToken}
        recipientSlug={recipientSlug}
        amountCents={amountCents}
        onPaid={onPaid}
        onCancel={onCancel}
      />
    </Elements>
  );
}

function CheckoutForm({
  clientSecret,
  orderId,
  statusToken,
  recipientSlug,
  amountCents,
  onPaid,
  onCancel,
}: {
  clientSecret: string;
  orderId: string;
  statusToken: string;
  recipientSlug: string;
  amountCents: number;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Check your card details.");
      setBusy(false);
      return;
    }
    const returnUrl = buildPostcardReturnUrl(orderId);
    if (!returnUrl || !storePostcardCheckoutContext({
      orderId,
      statusToken,
      recipientSlug,
      amountCents,
      clientSecret,
      expiresAt: Date.now() + CHECKOUT_CONTEXT_TTL_MS,
    })) {
      setError("Secure payment return could not be prepared. Check browser storage and try again.");
      setBusy(false);
      return;
    }

    const confirmation = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: returnUrl,
      },
    }).catch(() => null);
    if (!confirmation) {
      clearPostcardCheckoutContext(orderId);
      setError("Payment status could not be confirmed. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const { error: confirmError, paymentIntent } = confirmation;
    if (confirmError) {
      clearPostcardCheckoutContext(orderId);
      setError(confirmError.message ?? "Payment failed. Try again.");
      setBusy(false);
      return;
    }
    if (paymentIntent?.status === "succeeded") {
      clearPostcardCheckoutContext(orderId);
      onPaid();
      return;
    }
    if (paymentIntent?.status === "processing") {
      setError("Payment is still processing. Nothing will be printed until Stripe confirms it succeeded.");
      setBusy(false);
      return;
    }
    clearPostcardCheckoutContext(orderId);
    setError("Payment didn't complete. Try again.");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <p role="alert" className="text-sm text-error-primary">{error}</p> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button color="link-gray" size="lg" onClick={onCancel} isDisabled={busy}>
          Back
        </Button>
        <Button size="lg" onClick={pay} isLoading={busy} isDisabled={!stripe || busy}>
          Pay {formatPrice(amountCents)} & send
        </Button>
      </div>
    </div>
  );
}

function storePostcardCheckoutContext(context: PostcardCheckoutContext): boolean {
  try {
    globalThis.sessionStorage?.setItem(POSTCARD_CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
    return globalThis.sessionStorage?.getItem(POSTCARD_CHECKOUT_CONTEXT_KEY) !== null;
  } catch {
    return false;
  }
}

function buildPostcardReturnUrl(orderId: string): string | null {
  if (!isOrderId(orderId) || typeof globalThis.location?.origin !== "string") return null;
  const returnUrl = new URL("/fan-mail/postcard", globalThis.location.origin);
  if (returnUrl.origin !== globalThis.location.origin || returnUrl.pathname !== "/fan-mail/postcard") {
    return null;
  }
  returnUrl.searchParams.set("checkout", "return");
  returnUrl.searchParams.set("order", orderId);
  return returnUrl.toString();
}

export function isOrderId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isPaymentIntentClientSecret(value: string): boolean {
  return /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(value) && value.length <= 240;
}

export function isStatusToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,240}$/.test(value);
}
