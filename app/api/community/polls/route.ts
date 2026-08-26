import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listPolls } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feature 2 — public poll list with live results. myOptionId only if signed in. */
export async function GET() {
  const uid = await getCurrentFanUserId(); // null when anonymous — that's fine
  const polls = await listPolls(uid);
  return NextResponse.json({ polls }, { headers: { "Cache-Control": "private, no-store" } });
}
