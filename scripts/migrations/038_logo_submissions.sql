CREATE TABLE IF NOT EXISTS logo_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  public_name TEXT NOT NULL, design_name TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  denial_reason TEXT, reviewed_by_email TEXT, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logo_submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), submission_id UUID NOT NULL REFERENCES logo_submissions(id) ON DELETE CASCADE,
  file_role TEXT NOT NULL CHECK (file_role IN ('wordmark','icon','additional')), file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  public_enabled BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logo_submission_votes (
  submission_id UUID NOT NULL REFERENCES logo_submissions(id) ON DELETE CASCADE, ip_fingerprint TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up','down')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, ip_fingerprint)
);
CREATE INDEX IF NOT EXISTS logo_submissions_status_idx ON logo_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS logo_submission_votes_ip_idx ON logo_submission_votes(ip_fingerprint, updated_at DESC);
