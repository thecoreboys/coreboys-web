import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MultiviewEntry } from "@/components/watch/MultiviewEntry";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { entitlementDecision, getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import { getHomeWatchCatalog, getWatchCatalog } from "@/lib/watch/catalog";
import { buildMultiviewLiveRoom, restrictCatalogForLiveRoom } from "@/lib/watch/multiview-access";
import { compactWatchCatalog } from "@/lib/watch/catalog-cache";
import { multiviewRequestedReferences, projectMultiviewCatalog } from "@/lib/watch/multiview-catalog";

export const metadata: Metadata = withPageMetadata("/multiview", {
  title: "Multiview",
  description: "Watch multiple CORE streams together, choose your main video, and follow Twitch chat. Build your own Multiview room on desktop.",
  alternates: { canonical: "/multiview" },
});

export const dynamic = "force-dynamic";

type MultiviewPageProps = {
  searchParams: Promise<{ live?: string | string[]; add?: string | string[]; layout?: string | string[]; remote?: string }>;
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
  const references = openAllCurrentLive ? [] : multiviewRequestedReferences({
    add: Array.isArray(params.add) ? params.add[0] : params.add,
    layout: Array.isArray(params.layout) ? params.layout[0] : params.layout,
  });
  // The paid-cap check is independent of the public catalog. Resolve both
  // together so opening the all-live room doesn't add an avoidable serial
  // account/database wait after the catalog is ready.
  const [catalog, canUseExpandedMultiview] = await Promise.all([
    references.length ? getWatchCatalog() : getHomeWatchCatalog(),
    openAllCurrentLive ? expandedMultiviewAllowed() : Promise.resolve(false),
  ]);
  const initialLiveRoom = openAllCurrentLive
    ? buildMultiviewLiveRoom(catalog.live, canUseExpandedMultiview)
    : undefined;
  const browserCatalog = initialLiveRoom
    ? restrictCatalogForLiveRoom(catalog, initialLiveRoom)
    : catalog;
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-room-base" />}>
      <MultiviewEntry
        catalog={compactWatchCatalog(projectMultiviewCatalog(browserCatalog, references))}
        initialLiveRoom={initialLiveRoom}
        autoFillLive={openAllCurrentLive || params.remote === "1"}
        remoteHost
      />
    </Suspense>
  );
}
