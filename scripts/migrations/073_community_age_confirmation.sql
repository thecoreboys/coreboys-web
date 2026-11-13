-- Help applications retain their required attestation. Suggestions have none.
DO $$ BEGIN
  ALTER TABLE contributor_applications
    DROP CONSTRAINT IF EXISTS contributor_applications_age_confirmed_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contributor_applications_help_age_check'
      AND conrelid = 'contributor_applications'::regclass
  ) THEN
    ALTER TABLE contributor_applications
      ADD CONSTRAINT contributor_applications_help_age_check
      CHECK (submission_type = 'suggestion' OR age_confirmed = true);
  END IF;
END $$;
