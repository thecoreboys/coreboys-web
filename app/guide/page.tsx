import type { Metadata } from "next";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { GuideGrid } from "@/components/watch/GuideGrid";
import { GuideHistory } from "@/components/watch/GuideHistory";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildGuideNetworkRows } from "@/lib/watch/channels";
import { buildBroadcastHistoryFallback } from "@/lib/watch/airtime-history";
import { loadAirtimeDailyArchive } from "@/lib/watch/airtime-archive";
import { loadTwitchTrackerAnalytics } from "@/lib/twitchtracker-snapshots";
import "../watch/watch.css";
import "./guide.css";

export const metadata: Metadata = {
  title: "Guide",
  description: "Live streams, upcoming shows, and replays from The Core Boys.",
  alternates: { canonical: "/guide" },
};

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const [catalog, twitchTracker, archivedDaily] = await Promise.all([
    getWatchCatalog(),
    loadTwitchTrackerAnalytics().catch(() => ({ latest: [], history: [], games: [] })),
    loadAirtimeDailyArchive(),
  ]);
  const networks = buildGuideNetworkRows(catalog);
  const serverNow = new Date().toISOString();
  const airtimeFallback = buildBroadcastHistoryFallback(
    catalog.broadcasts,
    Date.parse(serverNow),
  );

  return (
    <WatchChrome catalog={catalog}>
      <GuideGrid serverNow={serverNow} initialLive={catalog.live} networks={networks} />
      <GuideHistory
        serverNow={serverNow}
        twitchTracker={twitchTracker.latest}
        fallbackSessions={airtimeFallback}
        archivedDaily={archivedDaily}
      />
    </WatchChrome>
  );
}
