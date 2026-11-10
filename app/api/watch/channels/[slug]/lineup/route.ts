import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildNetworkChannelLineup, resolveNetworkChannel, type NetworkChannelMode } from "@/lib/watch/channels";
import { packWatchItemLists } from "@/lib/watch/item-payload";

export const dynamic = "force-dynamic";

/** Hydrate one chosen playback queue, rather than every queue on Guide load. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const channel = resolveNetworkChannel((await params).slug);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const mode = new URL(request.url).searchParams.get("mode") ?? "continuous";
  if (!["live", "videos", "shorts", "continuous"].includes(mode)) return NextResponse.json({ error: "Invalid channel mode" }, { status: 400 });
  try {
    const items = buildNetworkChannelLineup(await getWatchCatalog(), channel, mode as NetworkChannelMode);
    return NextResponse.json(packWatchItemLists({ items }), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }
}
