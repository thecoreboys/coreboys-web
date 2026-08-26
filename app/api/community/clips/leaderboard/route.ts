import { NextResponse } from "next/server";
import { getClipLeaderboard } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feature 3 — "Top this week" leaderboard. ?window=week|all (default week). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const window = url.searchParams.get("window") ?? "week";
  const days = window === "all" ? 36500 : 7;
  const clips = await getClipLeaderboard(days, 10);
  return NextResponse.json({ clips });
}
