-- Explicit, account-scoped owner review. An owner review is never described as
-- an independent review, and does not replace subject permission or adulthood.
CREATE TABLE IF NOT EXISTS face_owner_photo_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz CHECK (revoked_at IS NULL OR revoked_at>=granted_at),
  grant_source text NOT NULL CHECK (length(btrim(grant_source)) BETWEEN 3 AND 500)
);
ALTER TABLE face_reference_assets ADD COLUMN IF NOT EXISTS review_mode text NOT NULL DEFAULT 'independent';
ALTER TABLE face_reference_assets ADD COLUMN IF NOT EXISTS owner_review_grant_id uuid REFERENCES face_owner_photo_reviewers(id) ON DELETE RESTRICT;
ALTER TABLE face_reference_assets DROP CONSTRAINT IF EXISTS face_reference_review_mode_check;
ALTER TABLE face_reference_assets ADD CONSTRAINT face_reference_review_mode_check CHECK (
  (review_mode='independent' AND owner_review_grant_id IS NULL)
  OR (review_mode='owner' AND owner_review_grant_id IS NOT NULL AND reviewed_by IS NOT NULL)
);
-- Replace only the original distinct-reviewer CHECK, retaining every consent,
-- retention, storage and state constraint.
DO $migration$
DECLARE item record;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='face_reference_assets'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) ~ 'reviewed_by.*created_by'
  LOOP EXECUTE format('ALTER TABLE face_reference_assets DROP CONSTRAINT %I',item.conname); END LOOP;
END $migration$;
ALTER TABLE face_reference_assets ADD CONSTRAINT face_reference_distinct_reviewer_check
  CHECK (state<>'approved' OR reviewed_by IS NULL OR reviewed_by<>created_by OR review_mode='owner');

CREATE OR REPLACE FUNCTION face_owner_photo_review_is_allowed(p_admin uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM face_owner_photo_reviewers owners JOIN admin_users staff ON staff.id=owners.admin_user_id
    WHERE owners.admin_user_id=p_admin AND owners.revoked_at IS NULL
      AND staff.role='admin' AND staff.deleted_at IS NULL AND staff.totp_enabled);
$$;

CREATE OR REPLACE FUNCTION face_reference_review_is_valid(p_reference uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM face_reference_assets refs JOIN face_consents consents ON consents.id=refs.consent_id AND consents.identity_id=refs.identity_id
    WHERE refs.id=p_reference AND refs.state='approved' AND refs.subject_approved
      AND refs.reviewed_by IS NOT NULL AND refs.reviewed_at IS NOT NULL AND refs.revoked_at IS NULL
      AND refs.retention_expires_at>now() AND consents.revoked_at IS NULL AND consents.expires_at>now()
      AND consents.subject_confirmed_adult AND consents.allow_template_creation
      AND ((refs.review_mode='independent' AND refs.reviewed_by<>refs.created_by AND refs.reviewed_by<>consents.granted_by)
        OR (refs.review_mode='owner' AND EXISTS(SELECT 1 FROM face_owner_photo_reviewers owners
          WHERE owners.id=refs.owner_review_grant_id AND owners.admin_user_id=refs.reviewed_by
            AND owners.granted_at<=refs.reviewed_at
            AND (owners.revoked_at IS NULL OR owners.revoked_at>refs.reviewed_at)))));
$$;

CREATE OR REPLACE FUNCTION face_guard_reference_review_independence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE consent_recorder uuid; owner_grant uuid;
BEGIN
  IF NEW.state='approved' THEN
    SELECT granted_by INTO consent_recorder FROM face_consents
      WHERE id=NEW.consent_id AND identity_id=NEW.identity_id
        AND revoked_at IS NULL AND expires_at>now() AND subject_confirmed_adult AND allow_template_creation;
    IF consent_recorder IS NULL OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'reference approval requires current adult subject permission and a recorded reviewer';
    END IF;
    IF NEW.review_mode='owner' THEN
      IF NOT face_owner_photo_review_is_allowed(NEW.reviewed_by) THEN RAISE EXCEPTION 'owner photo review is not enabled for this account'; END IF;
      SELECT id INTO owner_grant FROM face_owner_photo_reviewers WHERE admin_user_id=NEW.reviewed_by AND revoked_at IS NULL;
      NEW.owner_review_grant_id=owner_grant;
    ELSE
      IF NEW.reviewed_by=NEW.created_by OR NEW.reviewed_by=consent_recorder THEN
        RAISE EXCEPTION 'reference enrollment requires an independent second staff reviewer or explicit authorized owner review';
      END IF;
      NEW.owner_review_grant_id=NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS face_reference_assets_independent_review ON face_reference_assets;
CREATE TRIGGER face_reference_assets_independent_review
  BEFORE INSERT OR UPDATE OF state,reviewed_by,reviewed_at,review_mode,owner_review_grant_id,identity_id,consent_id,created_by
  ON face_reference_assets FOR EACH ROW EXECUTE FUNCTION face_guard_reference_review_independence();

CREATE OR REPLACE FUNCTION face_guard_template_set_consent() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE grant_row face_consents%ROWTYPE;
BEGIN
  IF NEW.state<>'active' THEN RETURN NEW; END IF;
  SELECT * INTO grant_row FROM face_consents WHERE id=NEW.consent_id AND identity_id=NEW.identity_id;
  IF grant_row.id IS NULL OR grant_row.revoked_at IS NOT NULL OR grant_row.expires_at<=now()
    OR NOT grant_row.subject_confirmed_adult OR NOT grant_row.allow_template_creation THEN
    RAISE EXCEPTION 'current adult template consent is required';
  END IF;
  IF NEW.expires_at>grant_row.expires_at THEN RAISE EXCEPTION 'template-set retention cannot exceed consent expiry'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(NEW.reference_hashes) supplied(content_sha256) WHERE NOT EXISTS(
    SELECT 1 FROM face_reference_assets refs WHERE refs.identity_id=NEW.identity_id AND refs.consent_id=NEW.consent_id
      AND refs.content_sha256=supplied.content_sha256 AND face_reference_review_is_valid(refs.id))) THEN
    RAISE EXCEPTION 'every template reference requires current independent or authorized owner approval';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION face_enrollment_is_current(p_job_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM face_enrollment_jobs jobs
    JOIN face_identities identities ON identities.id=jobs.identity_id AND identities.state='active'
    JOIN face_consents consents ON consents.id=jobs.consent_id AND consents.identity_id=identities.id
    WHERE jobs.id=p_job_id AND consents.revoked_at IS NULL AND consents.expires_at>now()
      AND consents.subject_confirmed_adult AND consents.allow_template_creation
      AND cardinality(jobs.reference_ids)=(SELECT count(DISTINCT refs.content_sha256) FROM face_reference_assets refs
        WHERE refs.id=ANY(jobs.reference_ids) AND refs.identity_id=identities.id AND refs.consent_id=consents.id
          AND face_reference_review_is_valid(refs.id) AND refs.storage_key ~ '^[0-9a-f-]{36}\.webp$'));
$$;

ALTER TABLE face_consents DROP CONSTRAINT IF EXISTS face_consents_capture_method_check;
ALTER TABLE face_consents ADD CONSTRAINT face_consents_capture_method_check
  CHECK (capture_method IN ('signed_release','subject_portal','owner_attested_email'));
CREATE OR REPLACE FUNCTION face_guard_owner_email_attestation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.capture_method='owner_attested_email' AND NOT face_owner_photo_review_is_allowed(NEW.granted_by) THEN
    RAISE EXCEPTION 'owner email attestation is not enabled for this account';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS face_consents_owner_email_attestation ON face_consents;
CREATE TRIGGER face_consents_owner_email_attestation BEFORE INSERT OR UPDATE OF capture_method,granted_by
  ON face_consents FOR EACH ROW EXECUTE FUNCTION face_guard_owner_email_attestation();

REVOKE ALL ON face_owner_photo_reviewers FROM PUBLIC;
REVOKE ALL ON FUNCTION face_owner_photo_review_is_allowed(uuid),face_reference_review_is_valid(uuid),face_guard_owner_email_attestation() FROM PUBLIC;
DO $migration$
DECLARE recipient text;
BEGIN
  FOREACH recipient IN ARRAY ARRAY['anon','authenticated','core_face_worker'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=recipient) THEN
      EXECUTE format('REVOKE ALL ON face_owner_photo_reviewers FROM %I',recipient);
      EXECUTE format('REVOKE ALL ON FUNCTION face_owner_photo_review_is_allowed(uuid),face_reference_review_is_valid(uuid),face_guard_owner_email_attestation() FROM %I',recipient);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='core_face_worker') THEN
    GRANT SELECT(id) ON face_reference_assets TO core_face_worker;
    GRANT EXECUTE ON FUNCTION face_reference_review_is_valid(uuid) TO core_face_worker;
  END IF;
END $migration$;
