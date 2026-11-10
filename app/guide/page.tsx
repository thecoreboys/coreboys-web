import type { Metadata } from "next";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { GuideGrid } from "@/components/watch/GuideGridServer";
import { GuideHistorySection } from "@/components/watch/GuideHistorySection";
import { getHomeWatchCatalog } from "@/lib/watch/catalog";
import { buildGuideNetworkRows } from "@/lib/watch/channels";
import { guideLiveCatalog } from "@/lib/watch/guide-live-catalog";
import "../watch/watch.css";
import "./guide.css";

export const metadata: Metadata = {
  title: "Guide",
  description: "Live streams, upcoming shows, and replays from The Core Boys.",
  alternates: { canonical: "/guide" },
};

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
