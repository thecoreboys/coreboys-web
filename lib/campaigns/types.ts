export const CAMPAIGN_PLACEMENTS = ["home", "clips"] as const;
export const CAMPAIGN_PLATFORMS = ["tiktok", "instagram", "youtube", "x"] as const;
export type CampaignPlacement = (typeof CAMPAIGN_PLACEMENTS)[number];
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number];
export type CampaignStatus = "draft" | "published" | "archived";

export type CampaignInput = {
  title: string;
  subject: string;
  summary: string;
  campaignUrl: string;
  imageUrl: string;
  logoUrl: string | null;
  rewardType: "cpm" | "pool";
  budgetCents: number;
  rateCents: number | null;
  platforms: CampaignPlatform[];
  campaignStartsAt: string | null;
  campaignEndsAt: string | null;
  displayStartsAt: string | null;
  displayEndsAt: string | null;
  placements: CampaignPlacement[];
  status: CampaignStatus;
  sortOrder: number;
};

export type Campaign = CampaignInput & {
  id: string;
  revision: number;
  updatedAt: string;
};

/** Public cards contain no staff identities or unpublished content. */
export type PublicCampaign = Omit<Campaign, "revision" | "updatedAt" | "status" | "sortOrder" | "placements">;
export type CampaignFeed = { campaigns: PublicCampaign[]; serverNow: string };
