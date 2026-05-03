-- Fan-wall photo submissions awaiting admin approval. The /fanzone
-- public form posts here; /admin/fanzone reviews and approves into the
-- public Fan Wall. Existing api-repo schemas already cover articles /
-- clips / members / crew / talents (collab_people, external_people)
-- so this is the only genuinely missing piece for the admin tools.

CREATE TABLE IF NOT EXISTS fan_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  thumb_url TEXT,
  caption TEXT,
  submitter_first_name TEXT NOT NULL,
  submitter_last_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  member_slugs TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  denial_reason TEXT,
  approved_at TIMESTAMPTZ,
  reviewed_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fan_submissions_status_idx
  ON fan_submissions (status, created_at DESC);
