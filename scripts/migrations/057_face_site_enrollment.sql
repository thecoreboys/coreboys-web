-- Private, leased enrollment requests. Photos/vectors never enter this queue.
ALTER TABLE face_worker_heartbeats ADD COLUMN IF NOT EXISTS enrollment_capable boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION heartbeat_face_enrollment(p_worker_id text,p_model_version text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_model_version IS NULL OR p_model_version !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid model version'; END IF;
  UPDATE face_worker_heartbeats SET enrollment_capable=true WHERE worker_id=p_worker_id AND status='healthy'
    AND last_heartbeat_at>now()-interval '90 seconds';
END $$;

REVOKE ALL ON FUNCTION heartbeat_face_enrollment(text,text) FROM PUBLIC;
CREATE TABLE IF NOT EXISTS face_enrollment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES face_identities(id),
  consent_id uuid NOT NULL REFERENCES face_consents(id),
  reference_ids uuid[] NOT NULL CHECK (cardinality(reference_ids) BETWEEN 3 AND 20),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','completed','failed')),
  requested_by uuid NOT NULL REFERENCES admin_users(id),
  worker_id text,
  lease_expires_at timestamptz,
  template_set_id uuid REFERENCES face_template_sets(id),
  error_code text CHECK (length(error_code) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS face_enrollment_one_active
  ON face_enrollment_jobs(identity_id) WHERE state IN ('queued','running');
REVOKE ALL ON face_enrollment_jobs FROM PUBLIC;

DO $owner_compat$ BEGIN
IF to_regprocedure('public.face_reference_review_is_valid(uuid)') IS NULL THEN
EXECUTE $original_definition$
CREATE OR REPLACE FUNCTION face_enrollment_is_current(p_job_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM face_enrollment_jobs j
    JOIN face_identities i ON i.id=j.identity_id AND i.state='active'
    JOIN face_consents c ON c.id=j.consent_id AND c.identity_id=i.id
    WHERE j.id=p_job_id AND c.revoked_at IS NULL AND c.expires_at>now()
      AND c.subject_confirmed_adult AND c.allow_template_creation
      AND cardinality(j.reference_ids)=(
        SELECT count(DISTINCT r.content_sha256) FROM face_reference_assets r
        WHERE r.id=ANY(j.reference_ids) AND r.identity_id=i.id AND r.consent_id=c.id
          AND r.state='approved' AND r.subject_approved AND r.revoked_at IS NULL
          AND r.reviewed_at IS NOT NULL AND r.reviewed_by<>r.created_by
          AND r.retention_expires_at>now() AND r.storage_key ~ '^[0-9a-f-]{36}\.webp$'
      )
  )
$$;
$original_definition$;
END IF;
END $owner_compat$;
REVOKE ALL ON FUNCTION face_enrollment_is_current(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION claim_face_enrollment(p_worker_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job face_enrollment_jobs; result jsonb;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid worker id';
  END IF;
  UPDATE face_enrollment_jobs SET state='failed',error_code='worker_interrupted',updated_at=now()
    WHERE state='running' AND lease_expires_at<now();
  UPDATE face_enrollment_jobs SET state='failed',error_code='approval_expired',updated_at=now()
    WHERE state='queued' AND NOT face_enrollment_is_current(id);
  SELECT * INTO job FROM face_enrollment_jobs WHERE state='queued'
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF job.id IS NULL THEN RETURN NULL; END IF;
  UPDATE face_enrollment_jobs SET state='running',worker_id=p_worker_id,
    lease_expires_at=now()+interval '10 minutes',updated_at=now() WHERE id=job.id;
  SELECT jsonb_build_object('id',job.id,'identity_id',job.identity_id,'consent_id',job.consent_id,
    'canonical_kind',(SELECT canonical_kind FROM face_identities WHERE id=job.identity_id),
    'canonical_slug',(SELECT canonical_slug FROM face_identities WHERE id=job.identity_id),
    'references',jsonb_agg(jsonb_build_object('key',r.storage_key,'sha256',r.content_sha256) ORDER BY r.id))
    INTO result FROM face_reference_assets r WHERE r.id=ANY(job.reference_ids);
  INSERT INTO face_audit_log(actor_type,actor_id,action,target_type,target_id,identity_id)
    VALUES ('worker',p_worker_id,'face.enrollment.started','face_enrollment_job',job.id::text,job.identity_id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION claim_face_enrollment(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION finish_face_enrollment(p_job_id uuid,p_worker_id text,p_template_set_id uuid,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job face_enrollment_jobs;
BEGIN
  SELECT * INTO job FROM face_enrollment_jobs WHERE id=p_job_id FOR UPDATE;
  IF job.id IS NULL OR job.state<>'running' OR job.worker_id<>p_worker_id OR job.lease_expires_at<=now() THEN
    RETURN false;
  END IF;
  IF p_template_set_id IS NOT NULL AND (NOT face_enrollment_is_current(job.id) OR NOT EXISTS (
    SELECT 1 FROM face_template_sets s WHERE s.id=p_template_set_id AND s.identity_id=job.identity_id
      AND s.consent_id=job.consent_id AND s.worker_id=p_worker_id AND s.state='active' AND s.expires_at>now()
      AND s.reference_hashes @> ARRAY(SELECT r.content_sha256 FROM face_reference_assets r WHERE r.id=ANY(job.reference_ids))
      AND cardinality(s.reference_hashes)=cardinality(job.reference_ids)
  )) THEN RETURN false; END IF;
  UPDATE face_enrollment_jobs SET state=CASE WHEN p_template_set_id IS NULL THEN 'failed' ELSE 'completed' END,
    template_set_id=p_template_set_id,error_code=CASE WHEN p_template_set_id IS NULL THEN left(coalesce(p_error_code,'enrollment_failed'),100) END,
    lease_expires_at=NULL,updated_at=now() WHERE id=job.id;
  INSERT INTO face_audit_log(actor_type,actor_id,action,target_type,target_id,identity_id)
    VALUES ('worker',p_worker_id,CASE WHEN p_template_set_id IS NULL THEN 'face.enrollment.failed' ELSE 'face.enrollment.completed' END,
      'face_enrollment_job',job.id::text,job.identity_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION finish_face_enrollment(uuid,text,uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='core_face_worker') THEN
    GRANT EXECUTE ON FUNCTION heartbeat_face_enrollment(text,text) TO core_face_worker;
    GRANT EXECUTE ON FUNCTION claim_face_enrollment(text) TO core_face_worker;
    GRANT EXECUTE ON FUNCTION finish_face_enrollment(uuid,text,uuid,text) TO core_face_worker;
  END IF;
END $$;

-- Supabase default grants must not expose private enrollment tables via its API.
DO $$ DECLARE api_role text; object record;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      FOR object IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'face\_%' ESCAPE '\' LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',object.tablename,api_role);
      END LOOP;
      FOR object IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND (p.proname LIKE 'face\_%' ESCAPE '\' OR p.proname ~ '^(claim|finish|heartbeat|import|sync|attest)_face_') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',object.signature,api_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
