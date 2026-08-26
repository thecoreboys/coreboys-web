import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { CommunityInputError, CommunityRateLimitError, createCommunityIdea } from "@/lib/fanzone-communities";
import { FANZONE_COMMUNITY_KEYS } from "@/lib/fanzone-community-config";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  communityKey: z.enum(FANZONE_COMMUNITY_KEYS),
  category: z.enum(["content", "event", "site", "community", "other"]),
  title: z.string().trim().min(4).max(100),
  problem: z.string().trim().min(8).max(500),
  proposal: z.string().trim().min(8).max(800),
}).strict();

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid idea" }, { status: 400 });
  try {
    const idea = await createCommunityIdea(userId, parsed.data);
    return NextResponse.json({ idea }, { status: 201 });
  } catch (error) {
    if (error instanceof CommunityRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof CommunityInputError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
