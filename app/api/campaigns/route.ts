import { NextResponse } from "next/server";
import { getPublicCampaigns } from "@/lib/campaigns/store";
import { campaignIsInWindow } from "@/lib/campaigns/schedule";
import { CAMPAIGN_PLACEMENTS, type CampaignPlacement } from "@/lib/campaigns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

// Every open home tab polls this route. Share one DB read per placement for a
// few seconds; schedule windows are still evaluated against the request time.
const CAMPAIGN_CACHE_MS = 15_000;
type CampaignRows = Awaited<ReturnType<typeof getPublicCampaigns>>;
const campaignCache = new Map<CampaignPlacement, { expiresAt: number; value: Promise<CampaignRows> }>();

function cachedPublicCampaigns(placement: CampaignPlacement): Promise<CampaignRows> {
  const hit = campaignCache.get(placement);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = getPublicCampaigns(placement);
  campaignCache.set(placement, { expiresAt: Date.now() + CAMPAIGN_CACHE_MS, value });
  void value.catch(() => { if (campaignCache.get(placement)?.value === value) campaignCache.delete(placement); });
  return value;
}

export async function GET(request: Request) {
  const placement = new URL(request.url).searchParams.get("placement");
  if (!CAMPAIGN_PLACEMENTS.includes(placement as CampaignPlacement)) {
    return NextResponse.json({ error: "Choose home or clips." }, { status: 400, headers });
  }
  try {
    const campaigns = await cachedPublicCampaigns(placement as CampaignPlacement);
    const now = Date.now();
    return NextResponse.json({ campaigns: campaigns.filter((campaign) => campaignIsInWindow(campaign, now)), serverNow: new Date(now).toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: "Campaigns are temporarily unavailable." }, { status: 503, headers });
  }
}
