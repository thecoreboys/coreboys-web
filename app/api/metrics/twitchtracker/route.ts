import { NextResponse } from "next/server";
import { loadTwitchTrackerAnalytics } from "@/lib/twitchtracker-snapshots";
import { TWITCHTRACKER_WINDOW_DAYS } from "@/lib/twitchtracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || null;
  const analytics = await loadTwitchTrackerAnalytics();
  const latest = slug
    ? analytics.latest.filter((row) => row.memberSlug === slug)
    : analytics.latest;
  const history = slug
    ? analytics.history.filter((row) => row.memberSlug === slug)
    : analytics.history;

  return NextResponse.json(
    {
      source: {
        provider: "TwitchTracker",
        windowDays: TWITCHTRACKER_WINDOW_DAYS,
        categoryScope: "twitch-wide",
      },
      available: latest.length > 0,
      latest,
      history,
      games: analytics.games,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    },
  );
}
