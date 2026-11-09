import type { Metadata } from "next";
import { Suspense } from "react";
import type { WatchItem } from "@/lib/watch/types";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { GuideGrid } from "@/components/watch/GuideGridServer";
import { GuideHistory } from "@/components/watch/GuideHistory";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildGuideNetworkRows } from "@/lib/watch/channels";
import { buildBroadcastHistoryFallback } from "@/lib/watch/airtime-history";
import { loadCachedChannelAirtime, loadCachedChannelTracker } from "@/lib/watch/channel-data";
import "../watch/watch.css";
import "./guide.css";

export const metadata: Metadata = {
  title: "Guide",
  description: "Live streams, upcoming shows, and replays from The Core Boys.",
  alternates: { canonical: "/guide" },
};

export const dynamic = "force-dynamic";

async function AirtimeHistory({ broadcasts, serverNow }: { broadcasts: WatchItem[]; serverNow: string }) {
  const [twitchTracker, archivedDaily] = await Promise.all([
    loadCachedChannelTracker().catch(() => []),
    loadCachedChannelAirtime(null),
  ]);
  const airtimeFallback = buildBroadcastHistoryFallback(
    broadcasts,
    Date.parse(serverNow),
  );

  return <GuideHistory
        serverNow={serverNow}
        twitchTracker={twitchTracker}
        fallbackSessions={airtimeFallback}
        archivedDaily={archivedDaily}
      />;
}

export default async function GuidePage() {
  const catalog = await getWatchCatalog();
  const serverNow = new Date().toISOString();
  const networks = buildGuideNetworkRows(catalog);
  return (
    <WatchChrome catalog={catalog}>
      <GuideGrid serverNow={serverNow} initialLive={catalog.live} networks={networks} />
      <Suspense fallback={<p role="status" className="px-5 py-8 text-sm text-secondary">Loading airtime history. The guide is ready above.</p>}>
        <AirtimeHistory broadcasts={catalog.broadcasts} serverNow={serverNow} />
      </Suspense>
    </WatchChrome>
  );
}
