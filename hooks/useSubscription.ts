"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  ALWAYS_FREE_FEATURE_IDS,
  PLANS,
  minimumPlanForFeature,
  type FeatureId,
} from "@/lib/subscriptions/catalog";
import type { AccountSubscriptionApiResponse } from "@/lib/subscriptions/api-contract";

async function fetchSubscription(url: string): Promise<AccountSubscriptionApiResponse> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`subscription_${response.status}`);
  return response.json() as Promise<AccountSubscriptionApiResponse>;
}

/**
 * Read-only client view of the server entitlement decision. Premium features
 * are allowed only when the account endpoint explicitly returns their IDs.
 * Signed-out, loading, and unavailable states intentionally fall back to Free.
 */
export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const { data, error, isLoading } = useSWR<AccountSubscriptionApiResponse>(
    !authLoading && user ? "/api/account/subscription" : null,
    fetchSubscription,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const allowed = useMemo(() => {
    if (data?.entitlements.allowed) return new Set<FeatureId>(data.entitlements.allowed);
    return new Set<FeatureId>(ALWAYS_FREE_FEATURE_IDS);
  }, [data]);

  const hasFeature = useCallback(
    (featureId: FeatureId) => allowed.has(featureId),
    [allowed],
  );

  const featureHref = useCallback((featureId: FeatureId) => {
    const upgrade = `/upgrade?feature=${encodeURIComponent(featureId)}`;
    return user ? upgrade : `/login?next=${encodeURIComponent(upgrade)}`;
  }, [user]);

  const requiredPlanName = useCallback((featureId: FeatureId) => {
    const planId = minimumPlanForFeature(featureId);
    return planId ? PLANS[planId].name : "Free";
  }, []);

  return {
    planId: data?.account.effectivePlanId ?? "free",
    planName: data?.account.effectivePlanName ?? "Free",
    signedIn: Boolean(user),
    loading: authLoading || Boolean(user && isLoading),
    unavailable: Boolean(user && error),
    hasFeature,
    featureHref,
    requiredPlanName,
  } as const;
}
