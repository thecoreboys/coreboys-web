import type { CampaignInput } from "./types";

/** Public organizer pages checked 2026-11-09. No closing dates were published.
 * The owner requested the usual 30-day window. These are website promotion
 * deadlines, not a claim about the organizer's exact campaign closing time.
 * Conflict handling never overwrites an admin's edits or archived campaigns. */
const common = {
  campaignEndsAt: null,
  displayStartsAt: null,
  displayEndsAt: null,
  placements: ["home", "clips"],
  status: "draft",
} satisfies Partial<CampaignInput>;

const SUPPLIED_CAMPAIGNS: Array<CampaignInput & { id: string }> = [
  {
    ...common, id: "432f45b8-ed16-4cc6-95d7-1655e6c7806a", title: "CORE in Shibuya", subject: "CORE",
    summary: "Six creators. One iconic crossing. Make the moment travel.",
    campaignUrl: "https://contentrewards.com/c/campaigns/432f45b8-ed16-4cc6-95d7-1655e6c7806a",
    imageUrl: "/campaigns/432f45b8-ed16-4cc6-95d7-1655e6c7806a.webp", logoUrl: null,
    rewardType: "cpm", budgetCents: 2_000_000, rateCents: 100,
    platforms: ["tiktok", "instagram", "youtube", "x"], campaignStartsAt: "2026-11-01T08:10:49.000Z", sortOrder: 0,
  },
  {
    ...common, id: "a2a0e028-45d8-4b11-8276-5d7d7fb22cab", title: "Make TapCap the main character", subject: "TapCap",
    summary: "A little character. A big idea. Create your next TapCap story.",
    campaignUrl: "https://contentrewards.com/c/campaigns/a2a0e028-45d8-4b11-8276-5d7d7fb22cab",
    imageUrl: "/campaigns/a2a0e028-45d8-4b11-8276-5d7d7fb22cab.webp", logoUrl: null,
    rewardType: "cpm", budgetCents: 500_000, rateCents: 135,
    platforms: ["tiktok", "instagram", "youtube"], campaignStartsAt: "2026-11-04T21:28:23.000Z", sortOrder: 1,
  },
  {
    ...common, id: "4479e5e2-9a00-489e-8b0c-345834f37cc7", title: "Lacy. Made to be clipped.", subject: "Lacy",
    summary: "Turn the best Lacy moments into your next great edit.",
    campaignUrl: "https://contentrewards.com/c/campaigns/4479e5e2-9a00-489e-8b0c-345834f37cc7",
    imageUrl: "/campaigns/4479e5e2-9a00-489e-8b0c-345834f37cc7.webp", logoUrl: "/comms/lacy.png",
    rewardType: "pool", budgetCents: 2_500_000, rateCents: null,
    platforms: ["tiktok", "instagram", "youtube"], campaignStartsAt: "2026-10-20T22:15:03.000Z", sortOrder: 2,
  },
  {
    ...common, id: "0b178e3c-fbd3-4294-8ded-394e3da9c62f", title: "Jason. Catch the moment.", subject: "Jason",
    summary: "Find the moments worth sharing. Put your own edit on them.",
    campaignUrl: "https://contentrewards.com/c/campaigns/0b178e3c-fbd3-4294-8ded-394e3da9c62f",
    imageUrl: "/campaigns/0b178e3c-fbd3-4294-8ded-394e3da9c62f.webp", logoUrl: "/comms/jason.png",
    rewardType: "pool", budgetCents: 900_000, rateCents: null,
    platforms: ["tiktok", "instagram", "youtube", "x"], campaignStartsAt: "2026-10-31T17:21:26.000Z", sortOrder: 3,
  },
  {
    ...common, id: "20b7c977-8d0c-4bd0-b9b0-2db9200f405b", title: "Lacy, for the timeline", subject: "Lacy on X",
    summary: "Your best Lacy edits, made for the conversation on X.",
    campaignUrl: "https://contentrewards.com/c/campaigns/20b7c977-8d0c-4bd0-b9b0-2db9200f405b",
    imageUrl: "/campaigns/20b7c977-8d0c-4bd0-b9b0-2db9200f405b.webp", logoUrl: "/comms/lacy.png",
    rewardType: "pool", budgetCents: 500_000, rateCents: null,
    platforms: ["x"], campaignStartsAt: "2026-10-20T22:15:06.000Z", sortOrder: 4,
  },
];

export const CAMPAIGN_SEEDS: Array<CampaignInput & { id: string }> = SUPPLIED_CAMPAIGNS.map((campaign) => ({
  ...campaign,
  status: "published",
  displayStartsAt: campaign.campaignStartsAt,
  displayEndsAt: new Date(Date.parse(campaign.campaignStartsAt!) + 30 * 86_400_000).toISOString(),
}));
