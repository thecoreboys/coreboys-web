-- Publicly researched photos are private review candidates, never worker inputs.
CREATE TABLE IF NOT EXISTS face_photo_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_kind text NOT NULL CHECK (canonical_kind IN ('member','crew','guest')),
  canonical_slug text NOT NULL CHECK (canonical_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  source_url text NOT NULL CHECK (length(source_url) <= 2000 AND source_url LIKE 'https://%'),
  image_source_url text NOT NULL CHECK (length(image_source_url) <= 3000 AND image_source_url LIKE 'https://%'),
  source_label text NOT NULL CHECK (length(source_label) BETWEEN 1 AND 240),
  research_note text NOT NULL DEFAULT '' CHECK (length(research_note) <= 1500),
  checked_at timestamptz NOT NULL,
  storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^[0-9a-f-]{36}\.webp$'),
  storage_deleted_at timestamptz,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 15728640),
  width integer NOT NULL CHECK (width >= 64),
  height integer NOT NULL CHECK (height >= 64),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','submitted','dismissed')),
  reference_id uuid UNIQUE REFERENCES face_reference_assets(id),
  reviewed_by uuid REFERENCES admin_users(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_kind,canonical_slug,content_sha256),
  CHECK ((state='submitted') = (reference_id IS NOT NULL)),
  CHECK (state='pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS face_photo_candidates_person ON face_photo_candidates(canonical_kind,canonical_slug,state);
REVOKE ALL ON face_photo_candidates FROM PUBLIC;
DO $$
DECLARE recipient text;
BEGIN
  FOREACH recipient IN ARRAY ARRAY['anon','authenticated','core_face_worker'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=recipient) THEN
      EXECUTE format('REVOKE ALL ON TABLE face_photo_candidates FROM %I',recipient);
    END IF;
  END LOOP;
END $$;
