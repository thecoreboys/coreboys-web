import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { CommunityInputError, CommunityRateLimitError, toggleCommunityIdeaVote } from "@/lib/fanzone-communities";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    return NextResponse.json(await toggleCommunityIdeaVote(userId, id.data));
  } catch (error) {
    if (error instanceof CommunityRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof CommunityInputError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
