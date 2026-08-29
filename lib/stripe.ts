/**
 * Server-only Stripe client. Returns `null` when STRIPE_SECRET_KEY is not
 * configured so the rest of the app can run in a sandbox / preview mode
 * (the postcard flow then simulates a successful payment instead of
 * charging a card).
 */
import Stripe from "stripe";

let _stripe: Stripe | null | undefined;

export type StripeKeyMode = "test" | "live" | "invalid" | "missing";

export function stripeSecretKeyMode(key: string | undefined): StripeKeyMode {
  const value = key?.trim() ?? "";
  if (!value) return "missing";
  if (value.startsWith("sk_test_")) return "test";
  if (value.startsWith("sk_live_")) return "live";
  return "invalid";
}

export function stripePublishableKeyMode(key: string | undefined): StripeKeyMode {
  const value = key?.trim() ?? "";
  if (!value) return "missing";
  if (value.startsWith("pk_test_")) return "test";
  if (value.startsWith("pk_live_")) return "live";
  return "invalid";
}

export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const mode = stripeSecretKeyMode(key);
  _stripe = key && (mode === "test" || mode === "live") ? new Stripe(key) : null;
  return _stripe;
}

/** True when real Stripe payments are wired up. */
export function stripeConfigured(): boolean {
  const secretMode = stripeSecretKeyMode(process.env.STRIPE_SECRET_KEY);
  const publishableMode = stripePublishableKeyMode(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  return (secretMode === "test" || secretMode === "live") && secretMode === publishableMode;
}
