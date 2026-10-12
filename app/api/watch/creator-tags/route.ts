import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetKey } from "@/lib/creator-tags/model";
import { defaultCreatorDirectory } from "@/lib/creator-tags/directory";
import { publicCreatorTags } from "@/lib/creator-tags/store";
import { creatorError } from "@/lib/creator-tags/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const key = AssetKey.safeParse(params.get("assetKey"));
  if (!key.success) return creatorError("Invalid media source.");
  const live = z.string().datetime({ offset: true }).nullable().safeParse(params.get("liveStartedAt"));
  if (!live.success) return creatorError("Invalid broadcast time.");
  try {
    return NextResponse.json(await publicCreatorTags(key.data, live.data), { headers: { "Cache-Control": "public, max-age=10" } });
  } catch {
    // Directory lookup remains useful during an index outage. Do not cache an empty tag snapshot.
    return NextResponse.json({ creators: defaultCreatorDirectory(), tags: [], mentions: [], unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
