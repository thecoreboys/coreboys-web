import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { siteWatchStats } from "@/lib/oauth/loyalty";
import { programFingerprint } from "@/lib/watch/edition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ stamped: false });
  const watch = await siteWatchStats(uid);
  return NextResponse.json({
    stamped: true,
    minutes: watch.minutes7d,
    chatMinutes: watch.chatMinutes7d,
    fingerprint: programFingerprint(`presence:${uid}:${watch.minutes7d}`),
    note: "Proof of presence on this site — not Twitch hours.",
  });
}
