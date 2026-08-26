-- DJ Cora is an approved, recorded-asset library. Nothing in this schema
-- invokes a voice model: playback always selects an existing audio URL.

CREATE TABLE IF NOT EXISTS radio_cue_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(?:[-:][a-z0-9]+)*$'),
  cue_kind TEXT NOT NULL CHECK (cue_kind IN ('tune_in','live_takeover','intermission','outro')),
  network_slug TEXT CHECK (network_slug IS NULL OR network_slug IN ('core','adapt','ron','lacy','marlon','jason','silky')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rotation_mode TEXT NOT NULL DEFAULT 'shuffle' CHECK (rotation_mode IN ('shuffle','ordered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radio_cue_pools_lookup_idx
  ON radio_cue_pools (cue_kind, network_slug, enabled);

CREATE TABLE IF NOT EXISTS radio_cue_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES radio_cue_pools(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  audio_url TEXT,
  transcript TEXT,
  spoken_template TEXT,
  source TEXT NOT NULL DEFAULT 'recorded' CHECK (source IN ('legacy','recorded','uploaded')),
  source_label TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 250 AND 180000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pool_id, slug),
  CHECK (status <> 'approved' OR audio_url IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS radio_cue_assets_one_fallback_per_pool_idx
  ON radio_cue_assets (pool_id) WHERE is_fallback AND status <> 'archived';
CREATE INDEX IF NOT EXISTS radio_cue_assets_ready_idx
  ON radio_cue_assets (pool_id, status, enabled, sort_order, created_at)
  WHERE status = 'approved' AND enabled = TRUE;

-- Pool rows are created even when a category has no recording yet. That lets
-- staff add approved takeover/intermission/outro assets without a deploy.
INSERT INTO radio_cue_pools (key,cue_kind,network_slug,title) VALUES
  ('tune-in:core','tune_in','core','CORE tune-in'),
  ('live-takeover:core','live_takeover','core','CORE live takeover'),
  ('intermission:core','intermission','core','CORE intermission'),
  ('outro:core','outro','core','CORE outro'),
  ('tune-in:adapt','tune_in','adapt','adapt tune-in'),
  ('live-takeover:adapt','live_takeover','adapt','adapt live takeover'),
  ('intermission:adapt','intermission','adapt','adapt intermission'),
  ('outro:adapt','outro','adapt','adapt outro'),
  ('tune-in:ron','tune_in','ron','ron tune-in'),
  ('live-takeover:ron','live_takeover','ron','ron live takeover'),
  ('intermission:ron','intermission','ron','ron intermission'),
  ('outro:ron','outro','ron','ron outro'),
  ('tune-in:lacy','tune_in','lacy','lacy tune-in'),
  ('live-takeover:lacy','live_takeover','lacy','lacy live takeover'),
  ('intermission:lacy','intermission','lacy','lacy intermission'),
  ('outro:lacy','outro','lacy','lacy outro'),
  ('tune-in:marlon','tune_in','marlon','marlon tune-in'),
  ('live-takeover:marlon','live_takeover','marlon','marlon live takeover'),
  ('intermission:marlon','intermission','marlon','marlon intermission'),
  ('outro:marlon','outro','marlon','marlon outro'),
  ('tune-in:jason','tune_in','jason','jason tune-in'),
  ('live-takeover:jason','live_takeover','jason','jason live takeover'),
  ('intermission:jason','intermission','jason','jason intermission'),
  ('outro:jason','outro','jason','jason outro'),
  ('tune-in:silky','tune_in','silky','silky tune-in'),
  ('live-takeover:silky','live_takeover','silky','silky live takeover'),
  ('intermission:silky','intermission','silky','silky intermission'),
  ('outro:silky','outro','silky','silky outro')
ON CONFLICT (key) DO NOTHING;

-- The current station recordings remain the trustworthy fallback on every
-- network. New alternatives are only served once an admin adds an approved,
-- already-rendered asset through the protected control room.
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000001',id,'station-tune','CORE 24/7 station tune','/audio/network-tunes/core-247.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:core'
ON CONFLICT (id) DO NOTHING;
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000002',id,'station-tune','Flock station tune','/audio/network-tunes/flock.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:adapt'
ON CONFLICT (id) DO NOTHING;
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000003',id,'station-tune','Stable station tune','/audio/network-tunes/stable.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:ron'
ON CONFLICT (id) DO NOTHING;
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000004',id,'station-tune','Thugs station tune','/audio/network-tunes/thugs.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:lacy'
ON CONFLICT (id) DO NOTHING;
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000005',id,'station-tune','M3 station tune','/audio/network-tunes/m3.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:marlon'
ON CONFLICT (id) DO NOTHING;
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000006',id,'station-tune','NMS station tune','/audio/network-tunes/nms.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:jason'
ON CONFLICT (id) DO NOTHING;
INSERT INTO radio_cue_assets
  (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
SELECT 'c0000000-0000-4000-8000-000000000007',id,'station-tune','SLG station tune','/audio/network-tunes/slg.mp3','legacy','approved',TRUE,TRUE,0
  FROM radio_cue_pools WHERE key='tune-in:silky'
ON CONFLICT (id) DO NOTHING;
