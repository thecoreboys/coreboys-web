/**
 * Server-only Stripe client. Returns `null` when STRIPE_SECRET_KEY is not
 * configured so the rest of the app can run in a sandbox / preview mode
 * (the postcard flow then simulates a successful payment instead of
 * charging a card).
 */
import Stripe from "stripe";

let _stripe: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  _stripe = key ? new Stripe(key) : null;
  return _stripe;
}

/** True when real Stripe payments are wired up. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
