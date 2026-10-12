import { NextResponse } from "next/server";
import { z } from "zod";
import { creatorDirectory } from "@/lib/creator-tags/store";
import { matchCreatorText } from "@/lib/creator-tags/model";
import { requireCreatorTagAccess } from "@/lib/creator-tags/access";
import { boundedCreatorJson, creatorError, sameOrigin } from "@/lib/creator-tags/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Text only. Image/model processing is deliberately absent, even with Azure credentials configured.
const Input = z.object({ text: z.string().trim().min(2).max(1000) }).strict();
export async function POST(request: Request) {
  if (!sameOrigin(request)) return creatorError("Invalid origin.", 403);
  const access = await requireCreatorTagAccess(request);
  if (!access.ok) return access.response;
  try {
    const input = Input.safeParse(await boundedCreatorJson(request));
    if (!input.success) return creatorError("Enter a name or username. Image analysis is disabled to avoid model charges.");
    const text = input.data.text;
    const creators = matchCreatorText(text, await creatorDirectory());
    return NextResponse.json({ text, creators, matchedBy: "written-text" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return creatorError("Text search could not complete. Enter the visible name or try again shortly.", 503);
  }
}
