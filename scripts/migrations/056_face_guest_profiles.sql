-- Admin-managed friends/streamers are separate from the CORE member/crew roster.
-- Saving profile metadata does not create consent, biometric templates or tags.
CREATE TABLE IF NOT EXISTS face_guest_profiles (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  twitch_login text CHECK (twitch_login ~ '^[a-z0-9_]{1,25}$'),
  youtube_url text CHECK (length(youtube_url) <= 300 AND youtube_url LIKE 'https://%'),
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(social_links)='array'),
  created_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS face_guest_profiles_twitch_login_idx
  ON face_guest_profiles(twitch_login) WHERE twitch_login IS NOT NULL;

ALTER TABLE face_identities DROP CONSTRAINT IF EXISTS face_identities_canonical_kind_check;
ALTER TABLE face_identities ADD CONSTRAINT face_identities_canonical_kind_check
  CHECK (canonical_kind IN ('member', 'crew', 'guest'));

-- Guest identities cannot outlive or silently switch their saved profile.
ALTER TABLE face_identities ADD COLUMN IF NOT EXISTS guest_profile_slug text
  GENERATED ALWAYS AS (CASE WHEN canonical_kind='guest' THEN canonical_slug END) STORED
  REFERENCES face_guest_profiles(slug) ON DELETE RESTRICT ON UPDATE RESTRICT;

REVOKE ALL ON face_guest_profiles FROM PUBLIC;
-- Workers resolve canonical kind/slug through face_identities. They need no
-- access to display names, handles or public profile destinations in this table.
