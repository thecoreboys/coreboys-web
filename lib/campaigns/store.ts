import "server-only";
import { query } from "@/lib/db";
import { CAMPAIGN_SEEDS } from "./seeds";
import { selectCampaigns } from "./schedule";
import type { Campaign, CampaignInput, CampaignPlacement } from "./types";

const COLUMNS = ["title", "subject", "summary", "campaign_url", "image_url", "logo_url", "reward_type", "budget_cents", "rate_cents", "platforms", "campaign_starts_at", "campaign_ends_at", "display_starts_at", "display_ends_at", "placements", "status", "sort_order"] as const;

// Kept in sync with additive migration 063 so new deployments can self-initialize.
export const CAMPAIGN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clipping_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, subject TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '', campaign_url TEXT NOT NULL UNIQUE, image_url TEXT NOT NULL, logo_url TEXT,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('cpm','pool')),
  budget_cents BIGINT NOT NULL CHECK (budget_cents > 0), rate_cents INTEGER CHECK (rate_cents > 0),
  platforms TEXT[] NOT NULL CHECK (cardinality(platforms) > 0 AND platforms <@ ARRAY['tiktok','instagram','youtube','x']::text[]),
  campaign_starts_at TIMESTAMPTZ, campaign_ends_at TIMESTAMPTZ, display_starts_at TIMESTAMPTZ, display_ends_at TIMESTAMPTZ,
  placements TEXT[] NOT NULL DEFAULT ARRAY['home','clips']::text[] CHECK (placements <@ ARRAY['home','clips']::text[]),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 9999), revision INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((reward_type = 'cpm' AND rate_cents IS NOT NULL) OR (reward_type = 'pool' AND rate_cents IS NULL)),
  CHECK (campaign_ends_at IS NULL OR campaign_starts_at IS NULL OR campaign_ends_at > campaign_starts_at),
  CHECK (display_ends_at IS NULL OR display_starts_at IS NULL OR display_ends_at > display_starts_at),
  CHECK (status <> 'published' OR (display_starts_at IS NOT NULL AND display_ends_at IS NOT NULL AND cardinality(placements) > 0)),
  CHECK (status <> 'published' OR campaign_ends_at IS NULL OR display_ends_at <= campaign_ends_at),
  CHECK (status <> 'published' OR campaign_starts_at IS NULL OR display_ends_at > campaign_starts_at)
);
CREATE INDEX IF NOT EXISTS clipping_campaigns_display_idx ON clipping_campaigns (status, sort_order, display_ends_at);
-- Campaign drafts, schedules, and edits are served through authorized server routes.
-- Revoke Supabase default API grants; retain owner/service-role access without FORCE RLS.
ALTER TABLE public.clipping_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.clipping_campaigns FROM PUBLIC;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.clipping_campaigns FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
`;

function values(c: CampaignInput): unknown[] {
  return [c.title, c.subject, c.summary, c.campaignUrl, c.imageUrl, c.logoUrl, c.rewardType, c.budgetCents, c.rateCents, c.platforms, c.campaignStartsAt, c.campaignEndsAt, c.displayStartsAt, c.displayEndsAt, c.placements, c.status, c.sortOrder];
}

let schema: Promise<void> | null = null;
export function ensureCampaignSchema(): Promise<void> {
  if (!schema) schema = query(CAMPAIGN_SCHEMA_SQL).then(async () => {
    // One batch, idempotent across instances; never resurrect or replace an edited ad.
    const params: unknown[] = [];
    const rows = CAMPAIGN_SEEDS.map((seed) => {
      const offset = params.length;
      params.push(seed.id, ...values(seed));
      return `(${Array.from({ length: COLUMNS.length + 1 }, (_, i) => `$${offset + i + 1}`).join(",")})`;
    });
    await query(`INSERT INTO clipping_campaigns (id,${COLUMNS.join(",")}) VALUES ${rows.join(",")} ON CONFLICT DO NOTHING`, params);
  }).catch((error) => { schema = null; throw error; });
  return schema;
}

const iso = (value: unknown): string | null => value ? new Date(value as string | Date).toISOString() : null;
export function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id), title: String(row.title), subject: String(row.subject), summary: String(row.summary),
    campaignUrl: String(row.campaign_url), imageUrl: String(row.image_url), logoUrl: row.logo_url ? String(row.logo_url) : null,
    rewardType: row.reward_type as Campaign["rewardType"], budgetCents: Number(row.budget_cents), rateCents: row.rate_cents === null ? null : Number(row.rate_cents),
    platforms: row.platforms as Campaign["platforms"], campaignStartsAt: iso(row.campaign_starts_at), campaignEndsAt: iso(row.campaign_ends_at),
    displayStartsAt: iso(row.display_starts_at), displayEndsAt: iso(row.display_ends_at), placements: row.placements as Campaign["placements"],
    status: row.status as Campaign["status"], sortOrder: Number(row.sort_order), revision: Number(row.revision), updatedAt: iso(row.updated_at)!,
  };
}

export async function getAdminCampaigns(): Promise<Campaign[]> {
  await ensureCampaignSchema();
  const result = await query("SELECT * FROM clipping_campaigns ORDER BY sort_order, created_at DESC LIMIT 500");
  return result.rows.map(mapCampaign);
}

export async function getPublicCampaigns(placement: CampaignPlacement, now = new Date()) {
  await ensureCampaignSchema();
  const result = await query(`SELECT * FROM clipping_campaigns
    WHERE status='published' AND $1=ANY(placements)
      AND display_starts_at <= $2 AND display_ends_at > $2
      AND (campaign_starts_at IS NULL OR campaign_starts_at <= $2)
      AND (campaign_ends_at IS NULL OR campaign_ends_at > $2)
    ORDER BY sort_order,id LIMIT 20`, [placement, now.toISOString()]);
  return selectCampaigns(result.rows.map(mapCampaign), placement, now.getTime());
}

export async function saveCampaign(input: CampaignInput, staffId: string, id?: string, revision?: number): Promise<Campaign | null> {
  await ensureCampaignSchema();
  const params = values(input);
  if (id) {
    const staffIndex = params.push(staffId);
    const idIndex = params.push(id);
    const revisionIndex = params.push(revision);
    const result = await query(`UPDATE clipping_campaigns SET ${COLUMNS.map((column, i) => `${column}=$${i + 1}`).join(",")},
      updated_by=$${staffIndex}, revision=revision+1, updated_at=NOW() WHERE id=$${idIndex} AND revision=$${revisionIndex} RETURNING *`, params);
    return result.rows[0] ? mapCampaign(result.rows[0]) : null;
  }
  params.push(staffId);
  const result = await query(`INSERT INTO clipping_campaigns (${COLUMNS.join(",")},updated_by)
    VALUES (${params.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, params);
  if (!result.rows[0]) throw new Error("Campaign insert did not return a row.");
  return mapCampaign(result.rows[0]);
}
