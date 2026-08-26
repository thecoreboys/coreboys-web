-- Curated TikTok posts use TikTok's public player endpoint. A creator OAuth
-- grant is only required for automatic account-feed discovery, not playback
-- of a public post URL that has been intentionally added to programming.

ALTER TABLE watch_curated_items
  DROP CONSTRAINT IF EXISTS watch_curated_items_platform_check;

ALTER TABLE watch_curated_items
  ADD CONSTRAINT watch_curated_items_platform_check
  CHECK (platform IN ('youtube', 'tiktok'));
