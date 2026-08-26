-- CORE Originals: editorial collections with an approval-first content queue.
CREATE TABLE IF NOT EXISTS core_originals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary TEXT,
  poster_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core_original_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL REFERENCES core_originals(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','tiktok','instagram','twitch','x','other')),
  title TEXT NOT NULL,
  subtitle TEXT,
  poster_url TEXT,
  format TEXT NOT NULL DEFAULT 'auto' CHECK (format IN ('auto','long','short','photo')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  recommendation_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  submitted_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_original_items_collection_status_idx
  ON core_original_items (original_id, status, sort_order, created_at DESC);
