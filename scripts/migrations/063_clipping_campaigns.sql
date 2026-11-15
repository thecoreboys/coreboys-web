-- Bounded website promotions. Null organizer closing dates remain unknown.
CREATE TABLE IF NOT EXISTS clipping_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  campaign_url TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  logo_url TEXT,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('cpm', 'pool')),
  budget_cents BIGINT NOT NULL CHECK (budget_cents > 0),
  rate_cents INTEGER CHECK (rate_cents > 0),
  platforms TEXT[] NOT NULL CHECK (cardinality(platforms) > 0 AND platforms <@ ARRAY['tiktok','instagram','youtube','x']::text[]),
  campaign_starts_at TIMESTAMPTZ,
  campaign_ends_at TIMESTAMPTZ,
  display_starts_at TIMESTAMPTZ,
  display_ends_at TIMESTAMPTZ,
  placements TEXT[] NOT NULL DEFAULT ARRAY['home','clips']::text[] CHECK (placements <@ ARRAY['home','clips']::text[]),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 9999),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
