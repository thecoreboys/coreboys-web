import type { Metadata } from "next";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { GuideGrid } from "@/components/watch/GuideGridServer";
import { GuideHistorySection } from "@/components/watch/GuideHistorySection";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildGuideNetworkRows } from "@/lib/watch/channels";
import "../watch/watch.css";
import "./guide.css";

export const metadata: Metadata = {
  title: "Guide",
  description: "Live streams, upcoming shows, and replays from The Core Boys.",
  alternates: { canonical: "/guide" },
};

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const catalog = await getWatchCatalog();
  const serverNow = new Date().toISOString();
  const networks = buildGuideNetworkRows(catalog);
  return (
    <WatchChrome catalog={catalog}>
      <GuideGrid serverNow={serverNow} initialLive={catalog.live} networks={networks} />
      <GuideHistorySection />
    </WatchChrome>
  );
}
