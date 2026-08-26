import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getPoll } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feature 2 — single poll (for polling live results). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const uid = await getCurrentFanUserId();
  const poll = await getPoll(id, uid);
  if (!poll || poll.status === "scheduled") return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ poll }, { headers: { "Cache-Control": "private, no-store" } });
}
