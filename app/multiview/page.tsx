import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MultiviewEntry } from "@/components/watch/MultiviewEntry";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { entitlementDecision, getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildMultiviewLiveRoom, restrictCatalogForLiveRoom } from "@/lib/watch/multiview-access";
import { compactWatchCatalog } from "@/lib/watch/catalog-cache";
import { multiviewRequestedReferences, projectMultiviewCatalog } from "@/lib/watch/multiview-catalog";

export const metadata: Metadata = {
  title: "Multiview",
  description: "Build a custom CORE watch room with multiple live streams, videos, and combined chat.",
  alternates: { canonical: "/multiview" },
};

export const dynamic = "force-dynamic";

type MultiviewPageProps = {
  searchParams: Promise<{ live?: string | string[]; add?: string | string[]; layout?: string | string[] }>;
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
  const references = initialLiveRoom ? [] : multiviewRequestedReferences({
    add: Array.isArray(params.add) ? params.add[0] : params.add,
    layout: Array.isArray(params.layout) ? params.layout[0] : params.layout,
  });
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-[#070709]" />}>
      <MultiviewEntry
        catalog={compactWatchCatalog(projectMultiviewCatalog(browserCatalog, references))}
        initialLiveRoom={initialLiveRoom}
      />
    </Suspense>
  );
}
