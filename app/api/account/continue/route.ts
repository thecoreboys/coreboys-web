import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  continueWatchingPlaybackTime,
  isContinueWatchingMark,
} from "@/lib/watch/continue-watching";
import { listProgress } from "@/lib/watch/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) {
    const response = NextResponse.json({ items: [] });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const rows = await listProgress(uid);
  const now = Date.now();
  const response = NextResponse.json({
    items: rows
      .filter((row) => row.kind !== "live" && isContinueWatchingMark(row, now))
      .sort((left, right) => continueWatchingPlaybackTime(right) - continueWatchingPlaybackTime(left))
      .slice(0, 16)
      .map((r) => ({
        kind: r.kind,
        subject: r.subject,
        ref: r.ref,
        progress: r.progress,
        positionSeconds: r.positionSeconds,
        durationSeconds: r.durationSeconds,
        at: r.positionUpdatedAt ?? r.updatedAt,
      })),
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
