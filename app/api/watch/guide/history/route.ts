import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildBroadcastHistoryFallback } from "@/lib/watch/airtime-history";
import { loadCachedChannelAirtime, loadCachedChannelTracker } from "@/lib/watch/channel-data";

export async function GET() {
  try {
    const [catalog, twitchTracker, archivedDaily] = await Promise.all([
      getWatchCatalog(), loadCachedChannelTracker().catch(() => []), loadCachedChannelAirtime(null),
    ]);
    const serverNow = new Date().toISOString();
    return NextResponse.json({ serverNow, twitchTracker, archivedDaily,
      fallbackSessions: buildBroadcastHistoryFallback(catalog.broadcasts, Date.parse(serverNow)),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "History unavailable" }, { status: 503 }); }
}
