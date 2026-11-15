import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveNetworkChannel } from "@/lib/watch/channels";
import { loadCachedChannelAirtime, loadCachedChannelTracker } from "@/lib/watch/channel-data";
import { getGroupPhotos, getMemberPhotos } from "@/lib/asset-index";
import { getMemberGalleryPhotos } from "@/lib/member-gallery";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const channel = resolveNetworkChannel((await params).slug);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const section = request.nextUrl.searchParams.get("section");
  try {
    if (section === "photos") {
      const defaults = channel.memberSlug ? [...getMemberPhotos(channel.memberSlug), ...getGroupPhotos()] : getGroupPhotos();
      const photos = await getMemberGalleryPhotos(channel.memberSlug ?? "", defaults);
      return NextResponse.json({ photos: photos.slice(0, 24), total: photos.length }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
    }
    if (section === "history") {
      const [twitchTracker, archivedDaily] = await Promise.all([
        loadCachedChannelTracker(), loadCachedChannelAirtime(channel.memberSlug),
      ]);
      return NextResponse.json({ twitchTracker, archivedDaily }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
    }
    return NextResponse.json({ error: "Choose photos or history" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "This section could not be loaded. Please try again." }, { status: 503 });
  }
}
