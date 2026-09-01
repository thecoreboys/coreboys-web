import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DvrMembershipGate } from "@/components/watch/DvrMembershipGate";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { MyListPage } from "@/components/watch/MyListPage";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { entitlementDecision, getAccountSubscriptionState } from "@/lib/subscriptions/entitlements";
import { minimumPlanForFeature, PLANS } from "@/lib/subscriptions/catalog";
import { getWatchCatalog } from "@/lib/watch/catalog";
import "../watch/watch.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DVR",
  description: "A private, membership-included CORE DVR with saved titles and watch progress.",
  alternates: { canonical: "/dvr" },
  robots: { index: false, follow: false },
};

export default async function DvrRoute() {
  const userId = await getCurrentFanUserId();
  if (!userId) redirect("/login?next=/dvr");
  const catalog = await getWatchCatalog();
  const requestHeaders = await headers();
  const requestHostname = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "thecoreboys.com").split(",")[0]!.trim();
  const subscription = await getAccountSubscriptionState({ userId, requestHostname });
  const featureId = "dvr.extended_retention" as const;
  const dvrAllowed = entitlementDecision(subscription, featureId).allowed;
  const requiredPlanId = minimumPlanForFeature(featureId);
  const planName = requiredPlanId ? PLANS[requiredPlanId].name : "CORE Membership";

  return (
    <WatchChrome catalog={catalog}>
      {dvrAllowed ? <MyListPage catalog={catalog} /> : <DvrMembershipGate planName={planName} />}
    </WatchChrome>
  );
}
