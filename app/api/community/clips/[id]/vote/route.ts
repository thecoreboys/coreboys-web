import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { toggleClipVote } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdParam = z.string().uuid();

/**
 * Feature 3 — toggle a fan's upvote on a clip. If the row exists it is
 * removed (un-upvote, no points removed); otherwise inserted and +5 points
 * are awarded idempotently (so toggling off then on again never re-awards).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!IdParam.safeParse(id).success) {
    return NextResponse.json({ error: "invalid clip id" }, { status: 400 });
  }

  const result = await toggleClipVote(id, uid);
  if (!result) return NextResponse.json({ error: "clip not found" }, { status: 404 });

  return NextResponse.json({ voted: result.voted, count: result.count });
}
