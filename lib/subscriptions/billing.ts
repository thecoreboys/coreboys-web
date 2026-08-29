import { query } from "@/lib/db";
import type { PoolClient } from "pg";
import { stripeSecretKeyMode } from "@/lib/stripe";
import {
  DEFAULT_SUPPORTER_BILLING_CONTROLS,
  validSupporterBillingControls,
  type SupporterBillingControls,
} from "@/lib/subscriptions/billing-policy";

export {
  MEMBERSHIP_DEFAULT_CENTS,
  MEMBERSHIP_MAXIMUM_CENTS,
  MEMBERSHIP_MINIMUM_CENTS,
  SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS,
  SUPPORTER_TERMS_VERSION,
  supporterAmountAllowed,
  validSupporterBillingControls,
  type SupporterBillingControls,
} from "@/lib/subscriptions/billing-policy";

type BillingControlRow = {
  minimum_amount_cents: number;
  maximum_amount_cents: number;
  default_amount_cents: number;
  subscriber_notice: string | null;
  notice_effective_at: Date | string | null;
  notice_published_at: Date | string | null;
  renewals_disabled_at: Date | string | null;
  updated_at: Date | string | null;
};

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/** Checkout is fail-closed if this control row is unavailable. */
export async function getSupporterBillingControls(client?: PoolClient): Promise<SupporterBillingControls> {
  const result = client ? await client.query<BillingControlRow>(
    `SELECT minimum_amount_cents, maximum_amount_cents, default_amount_cents,
            subscriber_notice, notice_effective_at, notice_published_at, renewals_disabled_at, updated_at
       FROM supporter_billing_controls WHERE singleton = true`,
  ) : await query<BillingControlRow>(
    `SELECT minimum_amount_cents, maximum_amount_cents, default_amount_cents,
            subscriber_notice, notice_effective_at, notice_published_at, renewals_disabled_at, updated_at
       FROM supporter_billing_controls WHERE singleton = true`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("supporter_billing_controls_missing");
  const controls: SupporterBillingControls = {
    minimumAmountCents: row.minimum_amount_cents,
    maximumAmountCents: row.maximum_amount_cents,
    defaultAmountCents: row.default_amount_cents,
    subscriberNotice: row.subscriber_notice,
    noticeEffectiveAt: iso(row.notice_effective_at),
    noticePublishedAt: iso(row.notice_published_at),
    renewalsDisabledAt: iso(row.renewals_disabled_at),
    updatedAt: iso(row.updated_at),
  };
  if (!validSupporterBillingControls(controls)) throw new Error("supporter_billing_controls_invalid");
  return controls;
}

export function defaultSupporterBillingControls(): SupporterBillingControls {
  return DEFAULT_SUPPORTER_BILLING_CONTROLS;
}

/** Fail-fast transaction lock shared by admin control writes and Checkout creation. */
export async function lockSupporterBillingControls(client: PoolClient): Promise<void> {
  const lock = await client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS acquired`,
    ["supporter-billing-controls"],
  );
  if (lock.rows[0]?.acquired !== true) throw new Error("billing_controls_busy");
}

/** Keep portal/webhook operations available even when new checkout is paused. */
export function membershipOperationsConfigured() {
  const secretMode = stripeSecretKeyMode(process.env.STRIPE_SECRET_KEY);
  return secretMode === "test" || secretMode === "live";
}

/** A separate switch prevents a postcard Stripe account from opening recurring checkout. */
export function membershipCheckoutConfigured() {
  return membershipOperationsConfigured()
    && process.env.STRIPE_MEMBERSHIP_ENABLED?.trim() === "true"
    && Boolean(process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET?.trim());
}

/** Backwards-compatible name used by the entitlement response for checkout availability. */
export function membershipBillingConfigured() {
  return membershipCheckoutConfigured();
}

export function publicSiteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const origin = new URL(configured).origin;
    return origin;
  }
  return new URL(request.url).origin;
}
