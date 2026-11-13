import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DvrMembershipGate } from "@/components/watch/DvrMembershipGate";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { DvrEntry } from "@/components/watch/DvrEntry";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { entitlementDecision, getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import { minimumPlanForFeature, PLANS } from "@/lib/subscriptions/catalog";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { getDvrItems } from "@/lib/watch/dvr-items-server";
import "../watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = withPageMetadata("/dvr", {
  title: "DVR",
  description: "Your private saved titles, folders, notes, and watch progress. Saving a title does not record its video.",
  alternates: { canonical: "/dvr" },
  robots: { index: false, follow: false },
});

export default async function DvrRoute() {
  const userId = await getCurrentFanUserId();
  if (!userId) redirect("/login?next=/dvr");
  const requestHeaders = await headers();
  const requestHostname = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "thecoreboys.com").split(",")[0]!.trim();
  const subscription = await getAccountSubscriptionState({ userId, requestHostname });
  const featureId = "dvr.extended_retention" as const;
  const dvrAllowed = entitlementDecision(subscription, featureId).allowed;
  const requiredPlanId = minimumPlanForFeature(featureId);
  const planName = requiredPlanId ? PLANS[requiredPlanId].name : "CORE Membership";
  const catalog = await getWatchCatalog();
  // Non-members keep the full Watch navigation around the upgrade gate.
  const items = dvrAllowed ? await getDvrItems(catalog, userId, entitlementDecision(subscription, "queue.templates").allowed) : [];

  return (
    <WatchChrome catalog={catalog}>
      {dvrAllowed ? <DvrEntry ownerId={userId} items={items} /> : <DvrMembershipGate planName={planName} />}
    </WatchChrome>
  );
}
