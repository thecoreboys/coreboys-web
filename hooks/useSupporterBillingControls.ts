"use client";

import useSWR from "swr";
import {
  validSupporterBillingControls,
  type SupporterBillingControls,
} from "@/lib/subscriptions/billing-policy";

type PublicBillingControls = SupporterBillingControls & { checkoutAvailable: boolean };

async function loadControls(url: string): Promise<PublicBillingControls | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const value = await response.json() as PublicBillingControls;
  return validSupporterBillingControls(value) ? { ...value, checkoutAvailable: value.checkoutAvailable === true } : null;
}

/** Shared public view of the active checkout range. SWR deduplicates nav/CTA reads. */
export function useSupporterBillingControls() {
  const { data } = useSWR<PublicBillingControls | null>(
    "/api/account/billing/settings",
    loadControls,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return data ?? null;
}

export function supporterPriceLabel(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
