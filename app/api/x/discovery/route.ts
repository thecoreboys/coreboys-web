import { NextResponse } from "next/server";
import { getConfiguredXFeaturedPostIds, getXCommunityDirectory } from "@/lib/x/config";
import { listApprovedXPostNominations } from "@/lib/x/nominations";

export const runtime = "nodejs";

export async function GET() {
  let featuredPostIds = getConfiguredXFeaturedPostIds();
  try {
    const approved = await listApprovedXPostNominations(null, 60);
    const moderatedFeature = approved.find((entry) => entry.featured);
    if (moderatedFeature) featuredPostIds = [moderatedFeature.postId];
  } catch {
    // Configuration remains a durable fallback if the moderation DB is down.
  }
  return NextResponse.json(
    {
      featuredPostIds,
      communities: getXCommunityDirectory(),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
