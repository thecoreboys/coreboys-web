-- Cached, public provider profile images for official creator accounts.
-- The social source registry already owns account identity and health, so
-- keep image metadata beside that source instead of adding another identity
-- table. Values are HTTPS URLs returned by the provider; access tokens never
-- enter this table.

ALTER TABLE social_source_registry
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_image_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_image_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS social_source_registry_profile_image_idx
  ON social_source_registry (provider, profile_image_checked_at DESC)
  WHERE profile_image_url IS NOT NULL;
