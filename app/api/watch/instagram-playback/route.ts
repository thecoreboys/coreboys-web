import { NextResponse } from "next/server";
import { getCachedInstagramPlayback } from "@/lib/watch/instagram-playback-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const shortcode = new URL(request.url).searchParams.get("shortcode") ?? "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(shortcode)) return NextResponse.json({ error: "invalid_shortcode" }, { status: 400 });
  return NextResponse.json({ media: await getCachedInstagramPlayback(shortcode) }, {
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
