-- Browser review stores metadata and human proposals, never uploaded video.
CREATE TABLE IF NOT EXISTS face_browser_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES face_sources(id),
  video_fingerprint text NOT NULL CHECK (video_fingerprint ~ '^[a-f0-9]{64}$'),
  fingerprint_algorithm text NOT NULL CHECK (fingerprint_algorithm='sha256-chunks-v1-4mib'),
  byte_size bigint NOT NULL CHECK (byte_size>0),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 86400000),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 240),
  created_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,video_fingerprint,fingerprint_algorithm)
);
CREATE TABLE IF NOT EXISTS face_browser_marks (
  review_id uuid NOT NULL REFERENCES face_browser_reviews(id) ON DELETE CASCADE,
  marker_key text NOT NULL CHECK (marker_key ~ '^[a-f0-9]{64}$'),
  track_id uuid NOT NULL UNIQUE REFERENCES face_tracks(id) ON DELETE CASCADE,
  PRIMARY KEY(review_id,marker_key)
);
-- Narrow idle-queue probe lets a worker acknowledge wake messages only after
-- all jobs (including another lease holder) and its template purges finish.
CREATE OR REPLACE FUNCTION face_worker_has_pending_work(p_worker text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM face_enrollment_jobs WHERE state IN ('queued','running'))
    OR EXISTS(SELECT 1 FROM face_jobs jobs WHERE
      (status IN ('leased','running') AND lease_expires_at>now())
      OR (status IN ('queued','leased','running') AND attempts<20
        AND face_worker_can_run_job(jobs.id,p_worker,true)))
    OR EXISTS(SELECT 1 FROM face_template_sets WHERE worker_id=p_worker AND state<>'purged'
      AND (state<>'active' OR expires_at<=now()));
$$;
REVOKE ALL ON face_browser_reviews,face_browser_marks FROM PUBLIC;
REVOKE ALL ON FUNCTION face_worker_has_pending_work(text) FROM PUBLIC;
DO $$
DECLARE recipient text;
BEGIN
  FOREACH recipient IN ARRAY ARRAY['anon','authenticated','core_face_worker'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=recipient) THEN
      EXECUTE format('REVOKE ALL ON face_browser_reviews,face_browser_marks FROM %I',recipient);
      EXECUTE format('REVOKE ALL ON FUNCTION face_worker_has_pending_work(text) FROM %I',recipient);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='core_face_worker') THEN
    GRANT EXECUTE ON FUNCTION face_worker_has_pending_work(text) TO core_face_worker;
  END IF;
END $$;
