"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
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
    if (!loading && !user) router.replace("/login?next=/account/plan");
  }, [loading, router, user]);

  if (loading || !user) {
    return (
      <div className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 sm:px-6 lg:px-8 lg:py-20" aria-busy="true">
        <span className="sr-only">Loading account plan</span>
        <div className="h-7 w-40 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-8 h-28 max-w-3xl animate-pulse rounded-2xl bg-secondary" />
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          <div className="h-[28rem] animate-pulse rounded-2xl bg-secondary" />
          <div className="h-[28rem] animate-pulse rounded-2xl bg-secondary" />
          <div className="h-[28rem] animate-pulse rounded-2xl bg-secondary" />
        </div>
      </div>
    );
  }

  return (
    <PricingExperience
      accountMode
      displayName={user.displayName}
      account={subscription?.account}
      accountLoading={subscriptionLoading}
      accountUnavailable={Boolean(subscriptionError)}
    />
  );
}
