-- Public profile research is kept separate from consent and reference photos.
-- Existing manually entered profiles remain usable; research imports explicitly
-- start pending. An import never creates identities, consent, photos or templates.
ALTER TABLE face_guest_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text CHECK (length(avatar_url) <= 2000),
  ADD COLUMN IF NOT EXISTS avatar_source_profile text CHECK (length(avatar_source_profile) <= 500),
  ADD COLUMN IF NOT EXISTS avatar_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS research jsonb CHECK (jsonb_typeof(research) = 'object'),
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending', 'approved', 'needs_changes')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text CHECK (length(review_note) <= 1000);

-- This existing table is already private (061); no new public grants or worker
-- access are needed for these columns.
REVOKE ALL ON face_guest_profiles FROM PUBLIC;
