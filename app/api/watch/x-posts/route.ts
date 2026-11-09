import { NextResponse } from "next/server";
import { getPublicXFeedSnapshot } from "@/lib/x-feed-snapshot";
import { buildLiveXFeedResponse } from "@/lib/watch/live-x-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public polling only reads the shared feed; it never spends provider credits. */
export async function GET() {
  try {
    const snapshot = await getPublicXFeedSnapshot();
    return NextResponse.json(buildLiveXFeedResponse(snapshot), {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "x_feed_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
}
