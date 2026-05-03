-- Track per-channel snapshots, not just per-(member, platform).
--
-- Members like Marlon have 3 separate YouTube channels with 3 different
-- subscriber counts. Before this migration the snapshot writer summed
-- them into a single row keyed by (member_slug, platform, snapshot_date),
-- so the member page rendered the same total next to every channel.
--
-- The fix: add a `handle` column (the channel URL or @-handle) and
-- include it in the unique key, so each channel snapshots independently.
-- Existing rows backfill to handle = '' so consumers that don't care
-- about the per-channel breakdown can keep summing across handles.

ALTER TABLE metric_snapshots
  ADD COLUMN IF NOT EXISTS handle TEXT NOT NULL DEFAULT '';

-- Drop the old unique constraint if present (Postgres auto-named it
-- after the columns when the original CREATE TABLE used UNIQUE(...)).
DO $$
DECLARE
  con TEXT;
BEGIN
  SELECT conname INTO con
  FROM pg_constraint
  WHERE conrelid = 'metric_snapshots'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%(member_slug, platform, snapshot_date)%';
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE metric_snapshots DROP CONSTRAINT %I', con);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS metric_snapshots_unique_per_channel
  ON metric_snapshots (member_slug, platform, handle, snapshot_date);

CREATE INDEX IF NOT EXISTS metric_snapshots_member_platform_handle_idx
  ON metric_snapshots (member_slug, platform, handle, snapshot_date DESC);
