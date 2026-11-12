import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { GuideGrid } from "@/components/watch/GuideGridServer";
import { GuideHistorySection } from "@/components/watch/GuideHistorySection";
import { getHomeWatchCatalog } from "@/lib/watch/catalog";
import { buildGuideNetworkRows } from "@/lib/watch/channels";
import { guideLiveCatalog } from "@/lib/watch/guide-live-catalog";
import "../watch/watch.css";
import "./guide.css";

export const metadata: Metadata = withPageMetadata("/guide", {
  title: "Live Stream Guide",
  description: "See who is live, find upcoming broadcasts, and browse past streams from The Core Boys with the CORE stream guide.",
  alternates: { canonical: "/guide" },
});

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const catalog = guideLiveCatalog(await getHomeWatchCatalog());
  const serverNow = new Date().toISOString();
  const networks = buildGuideNetworkRows(catalog);
  return (
    <WatchChrome catalog={catalog}>
      <GuideGrid serverNow={serverNow} initialLive={catalog.live} networks={networks} partial />
      <GuideHistorySection />
    </WatchChrome>
  );
}
