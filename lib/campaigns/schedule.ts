import type { Campaign, CampaignInput, CampaignPlacement, PublicCampaign } from "./types";

type Schedule = Pick<CampaignInput, "campaignStartsAt" | "campaignEndsAt" | "displayStartsAt" | "displayEndsAt">;
const time = (value: string | null) => value ? Date.parse(value) : NaN;

export function campaignWindow(campaign: Schedule): { start: number; end: number } | null {
  const displayStart = time(campaign.displayStartsAt);
  const displayEnd = time(campaign.displayEndsAt);
  if (!Number.isFinite(displayStart) || !Number.isFinite(displayEnd)) return null;
  const sourceStart = campaign.campaignStartsAt === null ? displayStart : time(campaign.campaignStartsAt);
  const sourceEnd = campaign.campaignEndsAt === null ? displayEnd : time(campaign.campaignEndsAt);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd)) return null;
  const start = Math.max(displayStart, sourceStart);
  const end = Math.min(displayEnd, sourceEnd);
  return end > start ? { start, end } : null;
}

/** End is exclusive. A stale cached card must never survive its deadline. */
export function campaignIsInWindow(campaign: Schedule, now = Date.now()): boolean {
  const window = campaignWindow(campaign);
  return !!window && Number.isFinite(now) && now >= window.start && now < window.end;
}

export function campaignState(campaign: CampaignInput, now = Date.now()): "draft" | "archived" | "scheduled" | "live" | "expired" {
  if (campaign.status !== "published") return campaign.status;
  const window = campaignWindow(campaign);
  if (!window) return "draft";
  if (now >= window.end) return "expired";
  return now < window.start ? "scheduled" : "live";
}

export function selectCampaigns(campaigns: Campaign[], placement: CampaignPlacement, now = Date.now()): PublicCampaign[] {
  return campaigns
    .filter((campaign) => campaign.status === "published" && campaign.placements.includes(placement) && campaignIsInWindow(campaign, now))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .slice(0, 20)
    .map(({ revision: _revision, updatedAt: _updatedAt, status: _status, sortOrder: _order, placements: _placements, ...card }) => card);
}

export function nextCampaignBoundary(campaigns: Schedule[], now: number): number | null {
  const boundaries = campaigns.flatMap((campaign) => {
    const window = campaignWindow(campaign);
    return window ? [window.start, window.end].filter((value) => value > now) : [];
  });
  return boundaries.length ? Math.min(...boundaries) : null;
}

export function formatCampaignMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
