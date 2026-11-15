import { NextResponse } from "next/server";
import { getPublicCampaigns } from "@/lib/campaigns/store";
import { campaignIsInWindow } from "@/lib/campaigns/schedule";
import { CAMPAIGN_PLACEMENTS, type CampaignPlacement } from "@/lib/campaigns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  const placement = new URL(request.url).searchParams.get("placement");
  if (!CAMPAIGN_PLACEMENTS.includes(placement as CampaignPlacement)) {
    return NextResponse.json({ error: "Choose home or clips." }, { status: 400, headers });
  }
  try {
    const campaigns = await getPublicCampaigns(placement as CampaignPlacement);
    const now = Date.now();
    return NextResponse.json({ campaigns: campaigns.filter((campaign) => campaignIsInWindow(campaign, now)), serverNow: new Date(now).toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: "Campaigns are temporarily unavailable." }, { status: 503, headers });
  }
}
