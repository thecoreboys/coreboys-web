ALTER TABLE contributor_applications
  ADD COLUMN IF NOT EXISTS submission_type text NOT NULL DEFAULT 'help' CHECK (submission_type IN ('help', 'suggestion')),
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'reviewed'));

CREATE INDEX IF NOT EXISTS contributor_applications_inbox_idx
  ON contributor_applications(submission_type, review_status, created_at DESC, id DESC);
