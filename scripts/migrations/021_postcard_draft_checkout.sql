-- Additive checkout bridge for the versioned PostcardDraft creative.
-- Migration 017 owns the broader postcard product system and remains
-- immutable; these order-snapshot columns intentionally layer on top of it.

ALTER TABLE postcard_orders
  ADD COLUMN IF NOT EXISTS draft_creative JSONB,
  ADD COLUMN IF NOT EXISTS has_custom_art BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS asset_count INTEGER NOT NULL DEFAULT 0;

-- Preserve truthful metadata for V1 rows created before these columns existed.
UPDATE postcard_orders
   SET has_custom_art = TRUE,
       asset_count = GREATEST(asset_count, 1)
 WHERE image_url IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_draft_creative_check'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_draft_creative_check
      CHECK (
        draft_creative IS NULL
        OR (
          jsonb_typeof(draft_creative) = 'object'
          AND octet_length(draft_creative::TEXT) <= 8388608
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_asset_count_check'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_asset_count_check
      CHECK (asset_count BETWEEN 0 AND 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_custom_art_count_check'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_custom_art_count_check
      CHECK (has_custom_art OR asset_count = 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS postcard_orders_custom_art_review_idx
  ON postcard_orders (status, created_at ASC)
  WHERE has_custom_art;
