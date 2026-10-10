import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { youtubeIdFromHref } from "@/lib/watch/playable";
import type { UnifiedLiveSnapshot } from "@/lib/watch/live-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let snapshotCache: { expiresAt: number; value: Promise<UnifiedLiveSnapshot> } | null = null;
// Browser clients can ask often, but the catalog build itself is coalesced in
// process. This lets a live transition show up quickly without multiplying
// provider reads for every open tab.
const SNAPSHOT_TTL_MS = 20_000;

function getSnapshot(): Promise<UnifiedLiveSnapshot> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) return snapshotCache.value;
  const value = getWatchCatalog().then((catalog) => ({
    live: catalog.live.map((item) => ({
      id: item.id,
      platform: item.platform,
      memberSlug: item.memberSlug,
      dvrVodId: item.dvr?.twitchVodId ?? null,
      login: item.live?.login?.toLowerCase() ?? null,
      youtubeId: item.platform === "youtube"
        ? youtubeIdFromHref(item.sourceUrl ?? item.href)
        : null,
      title: item.title ?? null,
      poster: item.poster ?? null,
      sourceUrl: item.sourceUrl ?? null,
      startedAt: item.live?.startedAt ?? item.publishedAt ?? null,
      viewerCount: item.live?.viewers ?? null,
    })),
    fetchedAt: catalog.fetchedAt,
  }));
  snapshotCache = { expiresAt: now + SNAPSHOT_TTL_MS, value };
  void value.catch(() => {
    if (snapshotCache?.value === value) snapshotCache = null;
  });
  return value;
}

export async function GET() {
  try {
    return NextResponse.json(await getSnapshot(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "live_snapshot_unavailable" }, { status: 503 });
  }
}
