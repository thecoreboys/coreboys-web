"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { BillingSummaryCard } from "@/components/account/BillingSummaryCard";
import { AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PricingExperience } from "@/components/marketing/PricingExperience";
import { useAuth } from "@/components/providers/AuthProvider";
import type { AccountSubscriptionApiResponse } from "@/lib/subscriptions/api-contract";

async function fetchSubscriptionPreview(url: string): Promise<AccountSubscriptionApiResponse> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("subscription_status_unavailable");
  return response.json() as Promise<AccountSubscriptionApiResponse>;
}

export default function AccountPlanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const {
    data: subscription,
    error: subscriptionError,
    isLoading: subscriptionLoading,
  } = useSWR<AccountSubscriptionApiResponse>(user ? "/api/account/subscription" : null, fetchSubscriptionPreview, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/account/settings/billing");
  }, [loading, router, user]);

  if (loading || !user) {
    return (
      <AccountSettingsLayout title="Membership & billing" description="Manage your CORE membership, payment details, and receipts." activeSection="billing">
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">Loading account plan</span>
          <div className="h-24 animate-pulse rounded-xl border border-secondary bg-primary" />
          <div className="h-[26rem] animate-pulse rounded-xl border border-secondary bg-primary" />
          <div className="h-48 animate-pulse rounded-xl border border-secondary bg-primary" />
        </div>
      </AccountSettingsLayout>
    );
  }

  return (
    <>
    <AccountSettingsLayout title="Membership & billing" description="Manage your CORE membership, payment details, and receipts." activeSection="billing">
      <PricingExperience
        accountMode
        account={subscription?.account}
        accountLoading={subscriptionLoading}
        accountUnavailable={Boolean(subscriptionError)}
      >
        <BillingSummaryCard />
      </PricingExperience>
    </AccountSettingsLayout>
    <SiteFooter />
    </>
  );
}
