import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildNetworkChannelHub, resolveNetworkChannel } from "@/lib/watch/channels";
import { channelArchivePage } from "@/lib/watch/channel-page-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const channel = resolveNetworkChannel((await params).slug);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const rail = query.get("rail");
  const after = query.get("after");
  if (!rail || rail.length > 300 || (after && after.length > 300)) return NextResponse.json({ error: "Invalid archive request" }, { status: 400 });
  try {
    const catalog = await getWatchCatalog();
    const page = channelArchivePage(buildNetworkChannelHub(catalog, channel), rail, after);
    return page ? NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ error: "Source not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "The archive could not be loaded. Please try again." }, { status: 503 });
  }
}
