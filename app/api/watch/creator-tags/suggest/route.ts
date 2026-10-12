import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getCurrentStaff } from "@/lib/admin-api";
import { redisIncrWithExpiry } from "@/lib/redis";
import { submitCreatorAnnotation } from "@/lib/creator-tags/store";
import { boundedCreatorJson, creatorError, sameOrigin } from "@/lib/creator-tags/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return creatorError("Invalid origin.", 403);
  const fan = await getCurrentFanUserId();
  const staff = fan ? null : await getCurrentStaff();
  const subject = fan ? `fan:${fan}` : staff ? `staff:${staff.id}` : null;
  if (!subject) return creatorError("Sign in to suggest a creator tag.", 401);
  const hits = await redisIncrWithExpiry(`creator-suggestions:${subject}`, 3600);
  if (hits != null && hits > 20) return creatorError("Tag suggestion limit reached. Try again later.", 429);
  try {
    const result = await submitCreatorAnnotation(await boundedCreatorJson(request), subject);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return creatorError("Check the creator, source and time range. The source must be indexed before tagging."); }
}
