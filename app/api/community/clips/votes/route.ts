import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getClipVotes } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feature 3 — hydrate upvote buttons. ?ids=uuid,uuid -> counts per clip +
 * which the current fan has upvoted (mine empty when anonymous).
 */
export async function GET(req: Request) {
  const uid = await getCurrentFanUserId();
  const url = new URL(req.url);
  const raw = url.searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    // basic uuid shape guard to avoid casting errors
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  const { counts, mine } = await getClipVotes(ids, uid);
  return NextResponse.json({ counts, mine });
}
