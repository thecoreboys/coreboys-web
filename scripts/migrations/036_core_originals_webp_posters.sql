-- Serve the CORE Originals rail from compact display-sized WebP artwork.
-- Keep custom admin poster URLs untouched.
UPDATE core_originals
SET poster_url = regexp_replace(poster_url, '\\.png$', '.webp')
WHERE slug IN (
  'core-rug',
  'basketball-segments',
  'hot-ones',
  'caretakers',
  'stable-99-kill-lead',
  'jason-the-ween',
  'core-environment'
)
  AND poster_url LIKE '/brand/events-series-challenges/%.png';
