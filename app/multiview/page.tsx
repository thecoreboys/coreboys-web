import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MultiPlayerStage } from "@/components/watch/MultiPlayerStage";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { entitlementDecision, getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildMultiviewLiveRoom, restrictCatalogForLiveRoom } from "@/lib/watch/multiview-access";

export const metadata: Metadata = {
  title: "Multiview",
  description: "Build a custom CORE watch room with multiple live streams, videos, and combined chat.",
  alternates: { canonical: "/multiview" },
};

export const dynamic = "force-dynamic";

type MultiviewPageProps = {
  searchParams: Promise<{ live?: string | string[] }>;
};

async function expandedMultiviewAllowed(): Promise<boolean> {
  try {
    const userId = await getCurrentFanUserId();
    if (!userId) return false;
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
    const state = await getAccountSubscriptionState({
      userId,
      requestHostname: host.split(":")[0] ?? "localhost",
    });
    return entitlementDecision(state, "multiview.expanded").allowed;
  } catch {
    // Missing/expired account data must never increase the server-issued cap.
    return false;
  }
}

export default async function MultiviewPage({ searchParams }: MultiviewPageProps) {
  const params = await searchParams;
  const liveParam = Array.isArray(params.live) ? params.live[0] : params.live;
  const openAllCurrentLive = liveParam === "all";
  const catalog = await getWatchCatalog();
  const initialLiveRoom = openAllCurrentLive
    ? buildMultiviewLiveRoom(catalog.live, await expandedMultiviewAllowed())
    : undefined;
  const browserCatalog = initialLiveRoom
    ? restrictCatalogForLiveRoom(catalog, initialLiveRoom)
    : catalog;
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-[#070709]" />}>
      <MultiPlayerStage
        catalog={browserCatalog}
        initialLiveRoom={initialLiveRoom}
        autoFillLive={Boolean(initialLiveRoom)}
      />
    </Suspense>
  );
}
