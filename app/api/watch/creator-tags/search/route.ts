import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getCurrentStaff } from "@/lib/admin-api";
import { redisIncrWithExpiry } from "@/lib/redis";
import { creatorDirectory } from "@/lib/creator-tags/store";
import { matchCreatorText } from "@/lib/creator-tags/model";
import { readCreatorText } from "@/lib/creator-tags/ocr";
import { boundedCreatorJson, creatorError, sameOrigin } from "@/lib/creator-tags/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Input = z.union([z.object({ text: z.string().trim().min(2).max(1000) }).strict(), z.object({ image: z.string().max(1_500_000) }).strict()]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return creatorError("Invalid origin.", 403);
  try {
    const input = Input.safeParse(await boundedCreatorJson(request, 1_510_000));
    if (!input.success) return creatorError("Enter a visible name, username or image crop.");
    let text: string;
    if ("image" in input.data) {
      const fan = await getCurrentFanUserId();
      const staff = fan ? null : await getCurrentStaff();
      const subject = fan ? `fan:${fan}` : staff ? `staff:${staff.id}` : null;
      if (!subject) return creatorError("Sign in to search image text, or enter the visible name instead.", 401);
      const count = await redisIncrWithExpiry(`creator-ocr-rate:${subject}`, 3600);
      if (count != null && count > 20) return creatorError("Image text search limit reached. Search by name instead.", 429);
      text = await readCreatorText(input.data.image, subject);
    } else text = input.data.text;
    const creators = matchCreatorText(text, await creatorDirectory());
    return NextResponse.json({ text, creators, matchedBy: "written-text" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return creatorError("Text search could not complete. Enter the visible name or try again shortly.", 503);
  }
}
