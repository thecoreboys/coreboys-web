-- Admin-managed Watch programming: community sources, channel routing,
-- individually curated videos, and reusable homepage sections.

CREATE TABLE IF NOT EXISTS watch_community_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  platform     TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'x')),
  source_ref   TEXT NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 500),
  source_url   TEXT,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, source_ref)
);

CREATE TABLE IF NOT EXISTS watch_community_source_routes (
  source_id    UUID NOT NULL REFERENCES watch_community_sources(id) ON DELETE CASCADE,
  network_slug TEXT NOT NULL CHECK (network_slug IN ('core', 'adapt', 'ron', 'lacy', 'marlon', 'jason', 'silky')),
  channel_mode TEXT NOT NULL CHECK (channel_mode IN ('videos', 'shorts', 'continuous')),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_id, network_slug, channel_mode)
);

CREATE TABLE IF NOT EXISTS watch_curated_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID REFERENCES watch_community_sources(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube', 'tiktok')),
  external_id    TEXT NOT NULL,
  source_url     TEXT NOT NULL,
  title          TEXT NOT NULL,
  subtitle       TEXT,
  poster_url     TEXT,
  format         TEXT NOT NULL DEFAULT 'auto' CHECK (format IN ('auto', 'long', 'short')),
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  hero_featured  BOOLEAN NOT NULL DEFAULT FALSE,
  hero_priority  INTEGER NOT NULL DEFAULT 100,
  published_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, external_id)
);

CREATE TABLE IF NOT EXISTS watch_home_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  kicker      TEXT,
  layout      TEXT NOT NULL DEFAULT 'standard' CHECK (layout IN ('standard', 'vertical')),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watch_home_section_sources (
  section_id UUID NOT NULL REFERENCES watch_home_sections(id) ON DELETE CASCADE,
  source_id  UUID NOT NULL REFERENCES watch_community_sources(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (section_id, source_id)
);

CREATE TABLE IF NOT EXISTS watch_home_section_items (
  section_id UUID NOT NULL REFERENCES watch_home_sections(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES watch_curated_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (section_id, item_id)
);

CREATE INDEX IF NOT EXISTS watch_sources_enabled_idx
  ON watch_community_sources (enabled, platform);
CREATE INDEX IF NOT EXISTS watch_routes_network_idx
  ON watch_community_source_routes (network_slug, channel_mode) WHERE enabled;
CREATE INDEX IF NOT EXISTS watch_curated_hero_idx
  ON watch_curated_items (hero_featured, hero_priority) WHERE enabled;
CREATE INDEX IF NOT EXISTS watch_sections_order_idx
  ON watch_home_sections (sort_order, created_at) WHERE enabled;
