-- Admin-controlled public gallery order for each creator.
--
-- No row = retain the checked-in member + group gallery. A row with an empty
-- array = intentionally hide that member gallery. URLs are stored rather than
-- only media asset ids so existing static /public photos can be curated too.

CREATE TABLE IF NOT EXISTS member_gallery_overrides (
  member_slug TEXT PRIMARY KEY,
  photo_urls  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_gallery_overrides_slug_check CHECK (char_length(member_slug) BETWEEN 1 AND 120),
  CONSTRAINT member_gallery_overrides_url_count_check CHECK (cardinality(photo_urls) <= 100)
);

CREATE INDEX IF NOT EXISTS member_gallery_overrides_updated_idx
  ON member_gallery_overrides (updated_at DESC);
