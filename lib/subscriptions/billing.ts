import { stripeConfigured } from "@/lib/stripe";

export const MEMBERSHIP_MINIMUM_CENTS = 300;
export const MEMBERSHIP_MAXIMUM_CENTS = 100_000;

/** A second explicit switch prevents a postcard key from accidentally opening recurring billing. */
export function membershipBillingConfigured() {
  return stripeConfigured()
    && process.env.STRIPE_MEMBERSHIP_ENABLED === "true"
    && Boolean(process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET);
}

export function publicSiteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    const origin = new URL(configured).origin;
    return origin;
  }
  return new URL(request.url).origin;
}
