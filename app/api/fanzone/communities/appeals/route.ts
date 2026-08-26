import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { appealCommunityRemoval, CommunityInputError, CommunityRateLimitError } from "@/lib/fanzone-communities";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  targetType: z.enum(["question", "idea"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(8).max(800),
}).strict();

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid appeal" }, { status: 400 });
  try {
    await appealCommunityRemoval(userId, parsed.data);
    return NextResponse.json({ ok: true });
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
