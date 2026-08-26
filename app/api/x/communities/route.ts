import { NextResponse } from "next/server";
import { getXCommunityDirectory } from "@/lib/x/config";
import { enrichXCommunityDirectory } from "@/lib/x/community-metadata";
import { isXCommunityKey } from "@/lib/x/parsing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (key && !isXCommunityKey(key)) {
    return NextResponse.json({ error: "unknown community" }, { status: 400 });
  }
  const base = getXCommunityDirectory().filter((entry) => !key || entry.key === key);
  const communities = await enrichXCommunityDirectory(base);
  return NextResponse.json(
    { communities },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=21600" } },
  );
}
