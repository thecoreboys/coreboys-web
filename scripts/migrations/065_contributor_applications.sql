CREATE TABLE IF NOT EXISTS contributor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL UNIQUE,
  details_encrypted text NOT NULL,
  ip_fingerprint text NOT NULL,
  age_confirmed boolean NOT NULL CHECK (age_confirmed = true),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributor_applications_created_idx ON contributor_applications(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS contributor_applications_ip_idx ON contributor_applications(ip_fingerprint, created_at DESC);
