import { NextResponse } from "next/server";
import { getHomeWatchCatalog } from "@/lib/watch/catalog";
import { buildBroadcastHistoryFallback } from "@/lib/watch/airtime-history";
import { loadCachedChannelAirtime, loadCachedChannelTracker } from "@/lib/watch/channel-data";
import { guideSourceWithDeadline } from "@/lib/watch/guide-source-deadline";

export async function GET() {
  try {
    const [catalog, twitchTracker, archivedDaily] = await Promise.all([
      guideSourceWithDeadline(getHomeWatchCatalog(), null, 2_000), loadCachedChannelTracker().catch(() => []), loadCachedChannelAirtime(null),
    ]);
    const serverNow = new Date().toISOString();
    return NextResponse.json({ serverNow, twitchTracker, archivedDaily,
      fallbackSessions: catalog ? buildBroadcastHistoryFallback(catalog.broadcasts, Date.parse(serverNow)) : [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "History unavailable" }, { status: 503 }); }
}
