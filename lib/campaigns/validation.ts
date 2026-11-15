import { z } from "zod";
import { CAMPAIGN_PLACEMENTS, CAMPAIGN_PLATFORMS } from "./types";
import { campaignWindow } from "./schedule";

export const campaignUrlSchema = z.string().trim().max(300).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "contentrewards.com" && !url.username && !url.password && !url.port
      && /^\/c\/campaigns\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/?$/i.test(url.pathname)
      && !url.search && !url.hash;
  } catch { return false; }
}, "Use the full https://contentrewards.com/c/campaigns/… link.")
  .transform((value) => {
    const url = new URL(value);
    url.pathname = url.pathname.toLowerCase().replace(/\/$/, "");
    return url.href;
  });

export const campaignImageSchema = z.string().trim().min(1).max(2000).refine((value) => {
  if (/^\/(?!\/)/.test(value)) return !/[\\?#\s]/.test(value) && !value.split("/").includes("..") && /\.(?:webp|png|jpe?g|avif)$/i.test(value);
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Use a local image path or an HTTPS image URL.");

const date = z.string().datetime({ offset: true }).nullable();
export const campaignInputSchema = z.object({
  title: z.string().trim().min(2, "Add a short card title.").max(70),
  subject: z.string().trim().min(1, "Enter the creator or brand.").max(32),
  summary: z.string().trim().max(120),
  campaignUrl: campaignUrlSchema,
  imageUrl: campaignImageSchema,
  logoUrl: campaignImageSchema.nullable(),
  rewardType: z.enum(["cpm", "pool"]),
  budgetCents: z.number().int().positive().max(100_000_000_000),
  rateCents: z.number().int().positive().max(10_000_000).nullable(),
  platforms: z.array(z.enum(CAMPAIGN_PLATFORMS)).min(1).max(4).transform((values) => [...new Set(values)]),
  campaignStartsAt: date,
  campaignEndsAt: date,
  displayStartsAt: date,
  displayEndsAt: date,
  placements: z.array(z.enum(CAMPAIGN_PLACEMENTS)).max(2).transform((values) => [...new Set(values)]),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.number().int().min(0).max(9999),
}).strict().superRefine((value, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (value.rewardType === "cpm" && value.rateCents === null) issue("rateCents", "Enter the reward per 1,000 views.");
  if (value.rewardType === "pool" && value.rateCents !== null) issue("rateCents", "Pool campaigns have no fixed per-view rate.");
  if (value.campaignStartsAt && value.campaignEndsAt && Date.parse(value.campaignEndsAt) <= Date.parse(value.campaignStartsAt)) issue("campaignEndsAt", "Campaign end must follow its launch.");
  if (value.displayStartsAt && value.displayEndsAt && Date.parse(value.displayEndsAt) <= Date.parse(value.displayStartsAt)) issue("displayEndsAt", "Hide time must follow the display start.");
  if (value.status === "published") {
    if (!value.displayStartsAt) issue("displayStartsAt", "Choose when the ad should appear.");
    if (!value.displayEndsAt) issue("displayEndsAt", "Choose when the ad must stop showing.");
    if (!value.placements.length) issue("placements", "Choose Home, Clips, or both.");
    if (value.displayStartsAt && value.displayEndsAt && !campaignWindow(value)) issue("displayEndsAt", "The display window must overlap the campaign dates.");
    if (value.campaignEndsAt && value.displayEndsAt && Date.parse(value.displayEndsAt) > Date.parse(value.campaignEndsAt)) issue("displayEndsAt", "The ad must stop by the campaign closing time.");
  }
});

export const campaignMutationSchema = z.object({
  id: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
  campaign: campaignInputSchema,
}).strict();
