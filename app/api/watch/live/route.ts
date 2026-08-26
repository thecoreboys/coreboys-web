import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import type { WatchPlatform } from "@/lib/watch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiveSnapshot = {
  live: Array<{
    id: string;
    platform: WatchPlatform;
    memberSlug: string | null;
    dvrVodId: string | null;
  }>;
  fetchedAt: string;
};

let snapshotCache: { expiresAt: number; value: Promise<LiveSnapshot> } | null = null;
// Browser clients can ask often, but the catalog build itself is coalesced in
// process. This lets a live transition show up quickly without multiplying
// provider reads for every open tab.
const SNAPSHOT_TTL_MS = 20_000;

function getSnapshot(): Promise<LiveSnapshot> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) return snapshotCache.value;
  const value = getWatchCatalog().then((catalog) => ({
    live: catalog.live.map((item) => ({
      id: item.id,
      platform: item.platform,
      memberSlug: item.memberSlug,
      dvrVodId: item.dvr?.twitchVodId ?? null,
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
