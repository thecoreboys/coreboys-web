import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getPointsTotal, getRecentActivity, tierFor } from "@/lib/points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feature 1 + 6: points total, derived badge tier, recent activity. */
export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [points, activity] = await Promise.all([
    getPointsTotal(uid),
    getRecentActivity(uid, 20),
  ]);
  const { tier, nextTierAt } = tierFor(points);

  return NextResponse.json({ points, tier, nextTierAt, activity });
}
