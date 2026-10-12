import { NextResponse } from "next/server";
import { requireCreatorTagAccess } from "@/lib/creator-tags/access";
import { redisIncrWithExpiry } from "@/lib/redis";
import { submitCreatorAnnotation } from "@/lib/creator-tags/store";
import { boundedCreatorJson, creatorError, sameOrigin } from "@/lib/creator-tags/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return creatorError("Invalid origin.", 403);
  const access = await requireCreatorTagAccess(request);
  if (!access.ok) return access.response;
  const subject = access.subject;
  const hits = await redisIncrWithExpiry(`creator-suggestions:${subject}`, 3600);
  if (hits != null && hits > 20) return creatorError("Tag suggestion limit reached. Try again later.", 429);
  try {
    const result = await submitCreatorAnnotation(await boundedCreatorJson(request), subject);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return creatorError("Check the creator, source and time range. The source must be indexed before tagging."); }
}
