"use client";

import useSWR from "swr";
import {
  validSupporterBillingControls,
  type SupporterBillingControls,
} from "@/lib/subscriptions/billing-policy";

async function loadControls(url: string): Promise<SupporterBillingControls | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const value = await response.json() as SupporterBillingControls;
  return validSupporterBillingControls(value) ? value : null;
}

/** Shared public view of the active checkout range. SWR deduplicates nav/CTA reads. */
export function useSupporterBillingControls() {
  const { data } = useSWR<SupporterBillingControls | null>(
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
