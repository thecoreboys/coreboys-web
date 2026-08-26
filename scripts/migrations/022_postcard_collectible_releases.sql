-- Truthful postcard collectibles: sealed set membership, approved releases,
-- chosen variants, atomic capped serial issuance, explicit bundle metadata,
-- a private digital binder projection, and deterministic set completion.
--
-- Migration 017 remains the source of truth for postcard packs and orders.
-- This migration is additive and intentionally keeps creative config, uploads,
-- messages, addresses, and provider data out of fan-facing projections.

CREATE TABLE IF NOT EXISTS postcard_collectible_sets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_slug   TEXT NOT NULL,
  code          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  state         TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','approved','retired')),
  created_by    UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  approved_by   UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_collectible_sets_member_check
    CHECK (member_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT postcard_collectible_sets_code_check
    CHECK (code ~ '^[a-z][a-z0-9-]{0,79}$'),
  CONSTRAINT postcard_collectible_sets_title_check
    CHECK (length(BTRIM(title)) BETWEEN 1 AND 120),
  CONSTRAINT postcard_collectible_sets_description_check
    CHECK (description IS NULL OR length(description) <= 1000),
  CONSTRAINT postcard_collectible_sets_approval_check
    CHECK (
      (state = 'draft' AND approved_by IS NULL AND approved_at IS NULL)
      OR (state IN ('approved','retired') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
  UNIQUE (member_slug, code),
  UNIQUE (id, member_slug)
);

CREATE TABLE IF NOT EXISTS postcard_collectible_releases (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id                    UUID NOT NULL REFERENCES postcard_collectible_sets(id) ON DELETE RESTRICT,
  code                      TEXT NOT NULL,
  title                     TEXT NOT NULL,
  description               TEXT,
  pack_revision_id          UUID NOT NULL REFERENCES postcard_pack_revisions(id) ON DELETE RESTRICT,
  design_id                 TEXT NOT NULL,
  serial_prefix             TEXT NOT NULL,
  max_supply                INTEGER NOT NULL CHECK (max_supply BETWEEN 1 AND 1000000),
  set_position              INTEGER NOT NULL CHECK (set_position BETWEEN 1 AND 10000),
  required_for_completion   BOOLEAN NOT NULL DEFAULT TRUE,
  state                     TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','approved','active','sold_out','retired')),
  available_from            TIMESTAMPTZ,
  available_until           TIMESTAMPTZ,
  created_by                UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  approved_by               UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  approved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_collectible_releases_code_check
    CHECK (code ~ '^[a-z][a-z0-9-]{0,79}$'),
  CONSTRAINT postcard_collectible_releases_title_check
    CHECK (length(BTRIM(title)) BETWEEN 1 AND 120),
  CONSTRAINT postcard_collectible_releases_description_check
    CHECK (description IS NULL OR length(description) <= 1000),
  CONSTRAINT postcard_collectible_releases_design_check
    CHECK (design_id ~ '^[a-z][a-z0-9-]{0,79}$'),
  CONSTRAINT postcard_collectible_releases_serial_prefix_check
    CHECK (serial_prefix ~ '^[A-Z0-9]{1,12}$'),
  CONSTRAINT postcard_collectible_releases_window_check
    CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from),
  CONSTRAINT postcard_collectible_releases_approval_check
    CHECK (
      (state = 'draft' AND approved_by IS NULL AND approved_at IS NULL)
      OR (
        state IN ('approved','active','sold_out','retired')
        AND approved_by IS NOT NULL
        AND approved_at IS NOT NULL
      )
    ),
  UNIQUE (set_id, code),
  UNIQUE (set_id, set_position),
  UNIQUE (id, set_id)
);

CREATE TABLE IF NOT EXISTS postcard_collectible_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id    UUID NOT NULL REFERENCES postcard_collectible_releases(id) ON DELETE RESTRICT,
  code          TEXT NOT NULL,
  title         TEXT NOT NULL,
  max_supply    INTEGER CHECK (max_supply IS NULL OR max_supply BETWEEN 1 AND 1000000),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  created_by    UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_collectible_variants_code_check
    CHECK (code ~ '^[a-z][a-z0-9-]{0,79}$'),
  CONSTRAINT postcard_collectible_variants_title_check
    CHECK (length(BTRIM(title)) BETWEEN 1 AND 80),
  UNIQUE (release_id, code),
  UNIQUE (id, release_id)
);

CREATE TABLE IF NOT EXISTS postcard_collectible_order_intents (
  order_id              TEXT PRIMARY KEY REFERENCES postcard_orders(id) ON DELETE RESTRICT,
  owner_user_id         TEXT REFERENCES fan_users(id) ON DELETE SET NULL,
  release_id            UUID NOT NULL REFERENCES postcard_collectible_releases(id) ON DELETE RESTRICT,
  variant_id            UUID NOT NULL,
  bundle_mode           TEXT NOT NULL DEFAULT 'single'
    CHECK (bundle_mode IN ('single','send_one_keep_one')),
  send_quantity         SMALLINT NOT NULL DEFAULT 1,
  keep_quantity         SMALLINT NOT NULL DEFAULT 0,
  inventory_quantity    SMALLINT NOT NULL DEFAULT 1,
  -- Short checkout hold. NULL means Stripe confirmed payment and the
  -- reservation is permanent until issuance or an explicit cancellation.
  reservation_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),
  state                 TEXT NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested','issuing','issued','cancelled')),
  issuance_batch_id     UUID UNIQUE,
  issued_at             TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_collectible_intents_variant_release_fkey
    FOREIGN KEY (variant_id, release_id)
    REFERENCES postcard_collectible_variants(id, release_id) ON DELETE RESTRICT,
  CONSTRAINT postcard_collectible_intents_bundle_check
    CHECK (
      (
        bundle_mode = 'single'
        AND send_quantity = 1
        AND keep_quantity = 0
        AND inventory_quantity = 1
      )
      OR (
        bundle_mode = 'send_one_keep_one'
        AND send_quantity = 1
        AND keep_quantity = 1
        AND inventory_quantity = 2
      )
    ),
  CONSTRAINT postcard_collectible_intents_state_check
    CHECK (
      (
        state = 'requested'
        AND issuance_batch_id IS NULL
        AND issued_at IS NULL
        AND cancelled_at IS NULL
      )
      OR (
        state = 'issuing'
        AND issuance_batch_id IS NOT NULL
        AND issued_at IS NULL
        AND cancelled_at IS NULL
      )
      OR (
        state = 'issued'
        AND issuance_batch_id IS NOT NULL
        AND issued_at IS NOT NULL
        AND cancelled_at IS NULL
      )
      OR (
        state = 'cancelled'
        AND issuance_batch_id IS NULL
        AND issued_at IS NULL
        AND cancelled_at IS NOT NULL
      )
    )
);

ALTER TABLE postcard_collectible_order_intents
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ
  DEFAULT (NOW() + INTERVAL '30 minutes');
DO $$
DECLARE
  had_guard BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'postcard_collectible_order_intents'::regclass
      AND tgname = 'postcard_collectible_intent_guard'
      AND NOT tgisinternal
  ) INTO had_guard;
  IF had_guard THEN
    ALTER TABLE postcard_collectible_order_intents
      DISABLE TRIGGER postcard_collectible_intent_guard;
  END IF;
  UPDATE postcard_collectible_order_intents
  SET reservation_expires_at = NULL
  WHERE state IN ('issuing','issued') AND reservation_expires_at IS NOT NULL;
  IF had_guard THEN
    ALTER TABLE postcard_collectible_order_intents
      ENABLE TRIGGER postcard_collectible_intent_guard;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS postcard_collectible_issuances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID NOT NULL,
  release_id        UUID NOT NULL REFERENCES postcard_collectible_releases(id) ON DELETE RESTRICT,
  variant_id        UUID NOT NULL,
  order_id          TEXT NOT NULL REFERENCES postcard_collectible_order_intents(order_id) ON DELETE RESTRICT,
  owner_user_id     TEXT REFERENCES fan_users(id) ON DELETE SET NULL,
  serial_number     INTEGER NOT NULL CHECK (serial_number > 0),
  copy_role         TEXT NOT NULL CHECK (copy_role IN ('single','sender_keep','recipient_send')),
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT,
  CONSTRAINT postcard_collectible_issuances_batch_fkey
    FOREIGN KEY (batch_id)
    REFERENCES postcard_collectible_order_intents(issuance_batch_id) ON DELETE RESTRICT,
  CONSTRAINT postcard_collectible_issuances_variant_release_fkey
    FOREIGN KEY (variant_id, release_id)
    REFERENCES postcard_collectible_variants(id, release_id) ON DELETE RESTRICT,
  CONSTRAINT postcard_collectible_issuances_revoke_check
    CHECK (
      (revoked_at IS NULL AND revoked_reason IS NULL)
      OR (
        revoked_at IS NOT NULL
        AND revoked_at >= issued_at
        AND length(BTRIM(revoked_reason)) BETWEEN 1 AND 500
      )
    ),
  UNIQUE (release_id, serial_number),
  UNIQUE (order_id, copy_role)
);

CREATE TABLE IF NOT EXISTS postcard_collectible_set_completions (
  owner_user_id   TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  set_id          UUID NOT NULL REFERENCES postcard_collectible_sets(id) ON DELETE RESTRICT,
  release_count   INTEGER NOT NULL CHECK (release_count > 0),
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_user_id, set_id)
);

CREATE INDEX IF NOT EXISTS postcard_collectible_sets_scope_idx
  ON postcard_collectible_sets (member_slug, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS postcard_collectible_releases_set_idx
  ON postcard_collectible_releases (set_id, state, set_position);
CREATE INDEX IF NOT EXISTS postcard_collectible_releases_availability_idx
  ON postcard_collectible_releases (state, available_from, available_until)
  WHERE state = 'active';
CREATE INDEX IF NOT EXISTS postcard_collectible_variants_release_idx
  ON postcard_collectible_variants (release_id, active, sort_order);
CREATE INDEX IF NOT EXISTS postcard_collectible_intents_owner_idx
  ON postcard_collectible_order_intents (owner_user_id, state, created_at DESC)
  WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS postcard_collectible_intents_capacity_idx
  ON postcard_collectible_order_intents (release_id, variant_id, state, reservation_expires_at);
CREATE INDEX IF NOT EXISTS postcard_collectible_issuances_owner_idx
  ON postcard_collectible_issuances (owner_user_id, issued_at DESC, id DESC)
  WHERE owner_user_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS postcard_collectible_issuances_release_idx
  ON postcard_collectible_issuances (release_id, variant_id, serial_number);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'postcard_collectible_sets',
    'postcard_collectible_releases',
    'postcard_collectible_variants',
    'postcard_collectible_order_intents'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS postcard_collectible_touch_updated_at ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER postcard_collectible_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION postcard_touch_updated_at()',
      table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION protect_postcard_collectible_set()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  transition_allowed BOOLEAN;
  release_total INTEGER;
  unapproved_total INTEGER;
  required_total INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' THEN
      RAISE EXCEPTION 'postcard collectible sets must be created as drafts';
    END IF;
    RETURN NEW;
  END IF;

  transition_allowed := CASE OLD.state
    WHEN 'draft' THEN NEW.state IN ('draft','approved')
    WHEN 'approved' THEN NEW.state IN ('approved','retired')
    WHEN 'retired' THEN NEW.state = 'retired'
    ELSE FALSE
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'illegal postcard collectible set transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF NEW.member_slug IS DISTINCT FROM OLD.member_slug
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'postcard collectible set ownership and scope are immutable';
  END IF;

  IF OLD.state IN ('approved','retired') AND (
    NEW.code IS DISTINCT FROM OLD.code
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'approved postcard collectible set definition is immutable';
  END IF;

  IF OLD.state = 'draft' AND NEW.state = 'approved' THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE state <> 'approved'),
      COUNT(*) FILTER (WHERE required_for_completion)
    INTO release_total, unapproved_total, required_total
    FROM postcard_collectible_releases
    WHERE set_id = OLD.id;
    IF release_total = 0 OR unapproved_total > 0 OR required_total = 0 THEN
      RAISE EXCEPTION 'approved postcard collectible set requires approved releases and at least one completion release';
    END IF;
  END IF;

  IF OLD.state = 'approved' AND NEW.state = 'retired' AND EXISTS (
    SELECT 1 FROM postcard_collectible_releases
    WHERE set_id = OLD.id AND state = 'active'
  ) THEN
    RAISE EXCEPTION 'active postcard collectible releases must be retired before their set';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_set_guard ON postcard_collectible_sets;
CREATE TRIGGER postcard_collectible_set_guard
BEFORE INSERT OR UPDATE ON postcard_collectible_sets
FOR EACH ROW EXECUTE FUNCTION protect_postcard_collectible_set();

CREATE OR REPLACE FUNCTION prevent_postcard_collectible_set_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'draft' THEN
    RAISE EXCEPTION 'approved postcard collectible sets cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_set_delete_guard ON postcard_collectible_sets;
CREATE TRIGGER postcard_collectible_set_delete_guard
BEFORE DELETE ON postcard_collectible_sets
FOR EACH ROW EXECUTE FUNCTION prevent_postcard_collectible_set_delete();

CREATE OR REPLACE FUNCTION protect_postcard_collectible_release()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  transition_allowed BOOLEAN;
  parent_state TEXT;
  parent_member TEXT;
  revision_state TEXT;
  revision_member TEXT;
  design_exists BOOLEAN;
  variant_total INTEGER;
  invalid_variant_total INTEGER;
  issued_total INTEGER;
BEGIN
  SELECT state, member_slug INTO parent_state, parent_member
  FROM postcard_collectible_sets WHERE id = NEW.set_id;
  IF parent_state IS NULL THEN
    RAISE EXCEPTION 'postcard collectible release requires an existing set';
  END IF;

  SELECT revisions.state, packs.member_slug,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(revisions.config->'designs', '[]'::JSONB)) design
      WHERE design->>'id' = NEW.design_id
    )
  INTO revision_state, revision_member, design_exists
  FROM postcard_pack_revisions revisions
  JOIN postcard_design_packs packs ON packs.id = revisions.pack_id
  WHERE revisions.id = NEW.pack_revision_id;
  IF revision_state IS NULL OR revision_member <> parent_member THEN
    RAISE EXCEPTION 'postcard collectible release creative must belong to the set member';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' OR parent_state <> 'draft' THEN
      RAISE EXCEPTION 'postcard collectible releases can only be added to draft sets';
    END IF;
    RETURN NEW;
  END IF;

  transition_allowed := CASE OLD.state
    WHEN 'draft' THEN NEW.state IN ('draft','approved')
    WHEN 'approved' THEN NEW.state IN ('approved','active','retired')
    WHEN 'active' THEN NEW.state IN ('active','sold_out','retired')
    WHEN 'sold_out' THEN NEW.state IN ('sold_out','retired')
    WHEN 'retired' THEN NEW.state = 'retired'
    ELSE FALSE
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'illegal postcard collectible release transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF OLD.state IN ('approved','active','sold_out','retired') AND (
    NEW.set_id IS DISTINCT FROM OLD.set_id
    OR NEW.code IS DISTINCT FROM OLD.code
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.pack_revision_id IS DISTINCT FROM OLD.pack_revision_id
    OR NEW.design_id IS DISTINCT FROM OLD.design_id
    OR NEW.serial_prefix IS DISTINCT FROM OLD.serial_prefix
    OR NEW.max_supply IS DISTINCT FROM OLD.max_supply
    OR NEW.set_position IS DISTINCT FROM OLD.set_position
    OR NEW.required_for_completion IS DISTINCT FROM OLD.required_for_completion
    OR NEW.available_from IS DISTINCT FROM OLD.available_from
    OR NEW.available_until IS DISTINCT FROM OLD.available_until
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'approved postcard collectible release supply and provenance are immutable';
  END IF;

  IF NEW.state IN ('approved','active','sold_out','retired') THEN
    IF revision_state <> 'published' OR NOT design_exists THEN
      RAISE EXCEPTION 'approved postcard collectible release requires a published revision design';
    END IF;
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE NOT active OR (max_supply IS NOT NULL AND max_supply > NEW.max_supply))
    INTO variant_total, invalid_variant_total
    FROM postcard_collectible_variants
    WHERE release_id = OLD.id;
    IF variant_total = 0 OR invalid_variant_total > 0 THEN
      RAISE EXCEPTION 'approved postcard collectible release requires active variants within its supply cap';
    END IF;
  END IF;

  IF NEW.state = 'active' AND parent_state <> 'approved' THEN
    RAISE EXCEPTION 'active postcard collectible release requires an approved set';
  END IF;

  IF NEW.state = 'sold_out' AND OLD.state <> 'sold_out' THEN
    SELECT COUNT(*) INTO issued_total
    FROM postcard_collectible_issuances WHERE release_id = OLD.id;
    IF issued_total < NEW.max_supply THEN
      RAISE EXCEPTION 'postcard collectible release cannot be sold out before its cap is issued';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_release_guard ON postcard_collectible_releases;
CREATE TRIGGER postcard_collectible_release_guard
BEFORE INSERT OR UPDATE ON postcard_collectible_releases
FOR EACH ROW EXECUTE FUNCTION protect_postcard_collectible_release();

CREATE OR REPLACE FUNCTION prevent_postcard_collectible_release_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  parent_state TEXT;
BEGIN
  SELECT state INTO parent_state FROM postcard_collectible_sets WHERE id = OLD.set_id;
  IF OLD.state <> 'draft' OR parent_state <> 'draft' THEN
    RAISE EXCEPTION 'approved postcard collectible releases cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_release_delete_guard ON postcard_collectible_releases;
CREATE TRIGGER postcard_collectible_release_delete_guard
BEFORE DELETE ON postcard_collectible_releases
FOR EACH ROW EXECUTE FUNCTION prevent_postcard_collectible_release_delete();

CREATE OR REPLACE FUNCTION protect_postcard_collectible_variant()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  release_state TEXT;
  release_cap INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN
    RAISE EXCEPTION 'postcard collectible variant release is immutable';
  END IF;
  SELECT state, max_supply INTO release_state, release_cap
  FROM postcard_collectible_releases
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.release_id ELSE NEW.release_id END;
  IF release_state <> 'draft' THEN
    RAISE EXCEPTION 'approved postcard collectible variants are immutable';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.max_supply IS NOT NULL AND NEW.max_supply > release_cap THEN
    RAISE EXCEPTION 'postcard collectible variant cap cannot exceed release cap';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'postcard collectible variant provenance is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_variant_guard ON postcard_collectible_variants;
CREATE TRIGGER postcard_collectible_variant_guard
BEFORE INSERT OR UPDATE OR DELETE ON postcard_collectible_variants
FOR EACH ROW EXECUTE FUNCTION protect_postcard_collectible_variant();

CREATE OR REPLACE FUNCTION validate_postcard_collectible_intent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  transition_allowed BOOLEAN;
  order_owner TEXT;
  order_mode TEXT;
  release_state TEXT;
  set_state TEXT;
  variant_active BOOLEAN;
  release_start TIMESTAMPTZ;
  release_end TIMESTAMPTZ;
  issuance_total INTEGER;
  valid_role_total INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    transition_allowed := CASE OLD.state
      WHEN 'requested' THEN NEW.state IN ('requested','issuing','cancelled')
      WHEN 'issuing' THEN NEW.state IN ('issuing','issued')
      WHEN 'issued' THEN NEW.state = 'issued'
      WHEN 'cancelled' THEN NEW.state = 'cancelled'
      ELSE FALSE
    END;
    IF NOT transition_allowed THEN
      RAISE EXCEPTION 'illegal postcard collectible intent transition: % -> %', OLD.state, NEW.state;
    END IF;
    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id AND NEW.owner_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'postcard collectible intent owner cannot be reassigned';
    END IF;
    IF (
      NEW.order_id IS DISTINCT FROM OLD.order_id
      OR NEW.release_id IS DISTINCT FROM OLD.release_id
      OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
      OR NEW.bundle_mode IS DISTINCT FROM OLD.bundle_mode
      OR NEW.send_quantity IS DISTINCT FROM OLD.send_quantity
      OR NEW.keep_quantity IS DISTINCT FROM OLD.keep_quantity
      OR NEW.inventory_quantity IS DISTINCT FROM OLD.inventory_quantity
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
      RAISE EXCEPTION 'postcard collectible intent selection is immutable';
    END IF;
    IF OLD.state = 'requested' AND NEW.state = 'requested'
      AND OLD.reservation_expires_at IS NULL
      AND NEW.reservation_expires_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'confirmed postcard collectible reservations cannot expire again';
    END IF;
    IF OLD.state = 'requested' AND NEW.state = 'requested'
      AND NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at
      AND NEW.reservation_expires_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'postcard collectible checkout holds cannot be extended';
    END IF;
  ELSIF NEW.state <> 'requested' THEN
    RAISE EXCEPTION 'postcard collectible intents must be created as requested';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.reservation_expires_at IS NULL THEN
    RAISE EXCEPTION 'new postcard collectible intents require a checkout hold';
  END IF;
  IF NEW.state IN ('issuing','issued') AND NEW.reservation_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'postcard collectible issuance requires a paid-confirmed reservation';
  END IF;

  SELECT fan_user_id, provider_mode INTO order_owner, order_mode
  FROM postcard_orders WHERE id = NEW.order_id;
  IF NEW.state IN ('requested','issuing') AND (
    NEW.owner_user_id IS NULL OR order_mode <> 'live'
  ) THEN
    RAISE EXCEPTION 'postcard collectible intents require a signed-in live order';
  END IF;
  IF NEW.owner_user_id IS NOT NULL AND order_owner IS DISTINCT FROM NEW.owner_user_id THEN
    RAISE EXCEPTION 'postcard collectible intent must belong to the signed-in order owner';
  END IF;

  SELECT releases.state, sets.state, releases.available_from, releases.available_until
  INTO release_state, set_state, release_start, release_end
  FROM postcard_collectible_releases releases
  JOIN postcard_collectible_sets sets ON sets.id = releases.set_id
  WHERE releases.id = NEW.release_id;
  SELECT active INTO variant_active
  FROM postcard_collectible_variants
  WHERE id = NEW.variant_id AND release_id = NEW.release_id;
  IF NEW.state = 'requested' AND variant_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'postcard collectible intent requires an active chosen variant';
  END IF;
  IF NEW.state = 'requested' AND (
    release_state <> 'active'
    OR set_state <> 'approved'
    OR (release_start IS NOT NULL AND release_start > NOW())
    OR (release_end IS NOT NULL AND release_end <= NOW())
  ) THEN
    RAISE EXCEPTION 'postcard collectible release is not currently available';
  END IF;
  IF NEW.state = 'issuing' AND (TG_OP <> 'UPDATE' OR OLD.reservation_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION 'postcard collectible issuance requires a paid-confirmed reservation';
  END IF;

  IF NEW.state = 'issued' AND OLD.state = 'issuing' THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (
        WHERE batch_id = NEW.issuance_batch_id
          AND release_id = NEW.release_id
          AND variant_id = NEW.variant_id
          AND (
            (NEW.bundle_mode = 'single' AND copy_role = 'single')
            OR (
              NEW.bundle_mode = 'send_one_keep_one'
              AND copy_role IN ('sender_keep','recipient_send')
            )
          )
      )
    INTO issuance_total, valid_role_total
    FROM postcard_collectible_issuances
    WHERE order_id = NEW.order_id;
    IF issuance_total <> NEW.inventory_quantity OR valid_role_total <> NEW.inventory_quantity THEN
      RAISE EXCEPTION 'issued postcard collectible intent requires its complete bundle';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_intent_guard ON postcard_collectible_order_intents;
CREATE TRIGGER postcard_collectible_intent_guard
BEFORE INSERT OR UPDATE ON postcard_collectible_order_intents
FOR EACH ROW EXECUTE FUNCTION validate_postcard_collectible_intent();

CREATE OR REPLACE FUNCTION prevent_issued_postcard_collectible_intent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('issuing','issued') THEN
    RAISE EXCEPTION 'issued postcard collectible intents cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_intent_delete_guard ON postcard_collectible_order_intents;
CREATE TRIGGER postcard_collectible_intent_delete_guard
BEFORE DELETE ON postcard_collectible_order_intents
FOR EACH ROW EXECUTE FUNCTION prevent_issued_postcard_collectible_intent_delete();

CREATE OR REPLACE FUNCTION protect_postcard_collectible_issuance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  release_cap INTEGER;
  release_state TEXT;
  set_state TEXT;
  release_start TIMESTAMPTZ;
  release_end TIMESTAMPTZ;
  variant_cap INTEGER;
  variant_active BOOLEAN;
  intent_row postcard_collectible_order_intents%ROWTYPE;
  issued_total INTEGER;
  next_serial INTEGER;
  variant_issued_total INTEGER;
  order_status TEXT;
  order_mode TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'postcard collectible issuance ledger is append-only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.release_id IS DISTINCT FROM OLD.release_id
      OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
      OR NEW.order_id IS DISTINCT FROM OLD.order_id
      OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
      OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
      OR NEW.copy_role IS DISTINCT FROM OLD.copy_role
      OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR (NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id AND NEW.owner_user_id IS NOT NULL)
    THEN
      RAISE EXCEPTION 'postcard collectible serial provenance is immutable';
    END IF;
    IF OLD.revoked_at IS NOT NULL AND (
      NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
      OR NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason
    ) THEN
      RAISE EXCEPTION 'revoked postcard collectible issuance is immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT releases.max_supply, releases.state, sets.state,
         releases.available_from, releases.available_until
  INTO release_cap, release_state, set_state, release_start, release_end
  FROM postcard_collectible_releases releases
  JOIN postcard_collectible_sets sets ON sets.id = releases.set_id
  WHERE releases.id = NEW.release_id
  FOR UPDATE OF releases;
  -- A Stripe-confirmed reservation remains honourable after the public
  -- release window closes or the catalog is retired. Capacity was reserved
  -- before payment; these states only prevent new checkout holds.
  IF release_state NOT IN ('active','sold_out','retired')
    OR set_state NOT IN ('approved','retired')
  THEN
    RAISE EXCEPTION 'postcard collectible release cannot honour reservations';
  END IF;

  SELECT max_supply, active INTO variant_cap, variant_active
  FROM postcard_collectible_variants
  WHERE id = NEW.variant_id AND release_id = NEW.release_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'postcard collectible variant is missing';
  END IF;

  SELECT * INTO intent_row
  FROM postcard_collectible_order_intents
  WHERE order_id = NEW.order_id AND issuance_batch_id = NEW.batch_id
  FOR UPDATE;
  IF intent_row.state <> 'issuing'
    OR intent_row.release_id <> NEW.release_id
    OR intent_row.variant_id <> NEW.variant_id
  THEN
    RAISE EXCEPTION 'postcard collectible issuance requires its locked order intent';
  END IF;

  IF intent_row.bundle_mode = 'single' THEN
    IF NEW.copy_role <> 'single' OR NEW.owner_user_id IS DISTINCT FROM intent_row.owner_user_id THEN
      RAISE EXCEPTION 'single postcard collectible issuance has invalid ownership metadata';
    END IF;
  ELSIF NEW.copy_role = 'sender_keep' THEN
    IF NEW.owner_user_id IS DISTINCT FROM intent_row.owner_user_id THEN
      RAISE EXCEPTION 'kept postcard collectible copy must belong to the order owner';
    END IF;
  ELSIF NEW.copy_role = 'recipient_send' THEN
    IF NEW.owner_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'sent postcard collectible copy cannot enter a private binder without a claim';
    END IF;
  ELSE
    RAISE EXCEPTION 'send-one/keep-one postcard collectible has an invalid copy role';
  END IF;

  SELECT status, provider_mode INTO order_status, order_mode
  FROM postcard_orders WHERE id = NEW.order_id;
  IF order_mode <> 'live' OR order_status NOT IN ('printing','mailed','sent') THEN
    RAISE EXCEPTION 'only accepted live postcard orders can consume collectible inventory';
  END IF;

  SELECT COUNT(*), COALESCE(MAX(serial_number), 0) + 1
  INTO issued_total, next_serial
  FROM postcard_collectible_issuances
  WHERE release_id = NEW.release_id;
  IF issued_total >= release_cap OR NEW.serial_number <> next_serial THEN
    RAISE EXCEPTION 'postcard collectible serial must be the next available number within the release cap';
  END IF;

  SELECT COUNT(*) INTO variant_issued_total
  FROM postcard_collectible_issuances
  WHERE variant_id = NEW.variant_id;
  IF variant_cap IS NOT NULL AND variant_issued_total >= variant_cap THEN
    RAISE EXCEPTION 'chosen postcard collectible variant is sold out';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_issuance_guard ON postcard_collectible_issuances;
CREATE TRIGGER postcard_collectible_issuance_guard
BEFORE INSERT OR UPDATE OR DELETE ON postcard_collectible_issuances
FOR EACH ROW EXECUTE FUNCTION protect_postcard_collectible_issuance();

CREATE OR REPLACE FUNCTION mark_postcard_collectible_release_sold_out()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE postcard_collectible_releases releases
  SET state = 'sold_out', updated_at = NOW()
  WHERE releases.id = NEW.release_id
    AND releases.state = 'active'
    AND (
      SELECT COUNT(*) FROM postcard_collectible_issuances issued
      WHERE issued.release_id = releases.id
    ) >= releases.max_supply;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_issuance_sold_out ON postcard_collectible_issuances;
CREATE TRIGGER postcard_collectible_issuance_sold_out
AFTER INSERT ON postcard_collectible_issuances
FOR EACH ROW EXECUTE FUNCTION mark_postcard_collectible_release_sold_out();

CREATE OR REPLACE FUNCTION prevent_postcard_collectible_completion_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'postcard collectible set completion is immutable';
END;
$$;
DROP TRIGGER IF EXISTS postcard_collectible_completion_no_update ON postcard_collectible_set_completions;
CREATE TRIGGER postcard_collectible_completion_no_update
BEFORE UPDATE ON postcard_collectible_set_completions
FOR EACH ROW EXECUTE FUNCTION prevent_postcard_collectible_completion_update();

CREATE OR REPLACE FUNCTION issue_postcard_collectible(
  p_order_id TEXT,
  p_owner_user_id TEXT
)
RETURNS TABLE (
  issuance_id UUID,
  serial_number INTEGER,
  copy_role TEXT,
  release_id UUID,
  variant_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  intent_row postcard_collectible_order_intents%ROWTYPE;
  release_row postcard_collectible_releases%ROWTYPE;
  variant_row postcard_collectible_variants%ROWTYPE;
  order_owner TEXT;
  order_status TEXT;
  order_mode TEXT;
  issued_total INTEGER;
  variant_issued_total INTEGER;
  next_serial INTEGER;
  batch UUID;
  required_total INTEGER;
  owned_total INTEGER;
BEGIN
  SELECT * INTO intent_row
  FROM postcard_collectible_order_intents
  WHERE order_id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'postcard collectible order intent not found';
  END IF;
  IF intent_row.owner_user_id IS NULL OR intent_row.owner_user_id <> p_owner_user_id THEN
    RAISE EXCEPTION 'postcard collectible order owner mismatch';
  END IF;
  IF intent_row.state = 'issued' THEN
    RETURN QUERY
      SELECT issued.id, issued.serial_number, issued.copy_role, issued.release_id, issued.variant_id
      FROM postcard_collectible_issuances issued
      WHERE issued.order_id = p_order_id
      ORDER BY issued.serial_number;
    RETURN;
  END IF;
  IF intent_row.state <> 'requested' THEN
    RAISE EXCEPTION 'postcard collectible order intent is not issuable';
  END IF;
  IF intent_row.reservation_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'postcard collectible reservation was not payment-confirmed';
  END IF;

  SELECT fan_user_id, status, provider_mode
  INTO order_owner, order_status, order_mode
  FROM postcard_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF order_owner IS DISTINCT FROM p_owner_user_id THEN
    RAISE EXCEPTION 'postcard collectible order owner mismatch';
  END IF;
  IF order_mode <> 'live' OR order_status NOT IN ('printing','mailed','sent') THEN
    RAISE EXCEPTION 'only accepted live postcard orders can consume collectible inventory';
  END IF;

  SELECT * INTO release_row
  FROM postcard_collectible_releases
  WHERE id = intent_row.release_id
  FOR UPDATE;
  IF release_row.state NOT IN ('active','sold_out','retired') THEN
    RAISE EXCEPTION 'postcard collectible release cannot honour reservations';
  END IF;

  SELECT chosen_variant.* INTO variant_row
  FROM postcard_collectible_variants chosen_variant
  WHERE chosen_variant.id = intent_row.variant_id
    AND chosen_variant.release_id = release_row.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chosen postcard collectible variant is missing';
  END IF;

  SELECT COUNT(*), COALESCE(MAX(issued.serial_number), 0) + 1
  INTO issued_total, next_serial
  FROM postcard_collectible_issuances issued
  WHERE issued.release_id = release_row.id;
  IF issued_total + intent_row.inventory_quantity > release_row.max_supply THEN
    RAISE EXCEPTION 'postcard collectible release is sold out';
  END IF;
  SELECT COUNT(*) INTO variant_issued_total
  FROM postcard_collectible_issuances issued
  WHERE issued.variant_id = variant_row.id;
  IF variant_row.max_supply IS NOT NULL
    AND variant_issued_total + intent_row.inventory_quantity > variant_row.max_supply
  THEN
    RAISE EXCEPTION 'chosen postcard collectible variant is sold out';
  END IF;

  batch := gen_random_uuid();
  UPDATE postcard_collectible_order_intents
  SET state = 'issuing', issuance_batch_id = batch, updated_at = NOW()
  WHERE order_id = p_order_id;

  IF intent_row.bundle_mode = 'single' THEN
    INSERT INTO postcard_collectible_issuances (
      batch_id, release_id, variant_id, order_id, owner_user_id, serial_number, copy_role
    ) VALUES (
      batch, release_row.id, variant_row.id, p_order_id, p_owner_user_id, next_serial, 'single'
    );
  ELSE
    INSERT INTO postcard_collectible_issuances (
      batch_id, release_id, variant_id, order_id, owner_user_id, serial_number, copy_role
    ) VALUES
      (batch, release_row.id, variant_row.id, p_order_id, p_owner_user_id, next_serial, 'sender_keep'),
      (batch, release_row.id, variant_row.id, p_order_id, NULL, next_serial + 1, 'recipient_send');
  END IF;

  UPDATE postcard_collectible_order_intents
  SET state = 'issued', issued_at = NOW(), updated_at = NOW()
  WHERE order_id = p_order_id;

  SELECT COUNT(*) INTO required_total
  FROM postcard_collectible_releases required_release
  WHERE required_release.set_id = release_row.set_id
    AND required_release.required_for_completion
    AND required_release.state IN ('approved','active','sold_out','retired');
  SELECT COUNT(DISTINCT owned.release_id) INTO owned_total
  FROM postcard_collectible_issuances owned
  JOIN postcard_collectible_releases owned_release ON owned_release.id = owned.release_id
  WHERE owned.owner_user_id = p_owner_user_id
    AND owned.revoked_at IS NULL
    AND owned_release.set_id = release_row.set_id
    AND owned_release.required_for_completion;
  IF required_total > 0 AND owned_total = required_total THEN
    INSERT INTO postcard_collectible_set_completions (owner_user_id, set_id, release_count)
    VALUES (p_owner_user_id, release_row.set_id, required_total)
    ON CONFLICT (owner_user_id, set_id) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT issued.id, issued.serial_number, issued.copy_role, issued.release_id, issued.variant_id
    FROM postcard_collectible_issuances issued
    WHERE issued.order_id = p_order_id
    ORDER BY issued.serial_number;
END;
$$;
REVOKE ALL ON FUNCTION issue_postcard_collectible(TEXT, TEXT) FROM PUBLIC;

-- Migration 021 made has_custom_art authoritative for every rich draft,
-- including signature-only art. Rebuild the pre-021 safe inbox projection so
-- it no longer infers custom art solely from upload rows or legacy image_url.
CREATE OR REPLACE VIEW postcard_member_inbox_safe
WITH (security_barrier = TRUE) AS
SELECT
  orders.id,
  orders.recipient_slug AS member_slug,
  orders.message,
  orders.sender_name,
  orders.design_id,
  orders.pack_id,
  orders.pack_revision_id,
  orders.provider_mode,
  orders.status,
  orders.has_custom_art,
  orders.created_at,
  orders.updated_at
FROM postcard_orders orders
WHERE orders.status IN ('printing','mailed','sent')
  AND COALESCE(orders.moderation, 'passed') = 'passed';

-- Private binder projection. API code must filter owner_user_id to the current
-- signed-in fan. Order IDs, messages, sender copy, creative data, pack config,
-- upload keys, addresses, payment data, and provider data are intentionally absent.
CREATE OR REPLACE VIEW postcard_collectible_binder_safe
WITH (security_barrier = TRUE) AS
SELECT
  issued.owner_user_id,
  issued.id AS collectible_id,
  sets.id AS set_id,
  sets.code AS set_code,
  sets.title AS set_title,
  sets.member_slug,
  releases.id AS release_id,
  releases.code AS release_code,
  releases.title AS release_title,
  releases.serial_prefix,
  releases.max_supply AS edition_size,
  variants.id AS variant_id,
  variants.code AS variant_code,
  variants.title AS variant_title,
  issued.serial_number,
  issued.copy_role,
  issued.issued_at
FROM postcard_collectible_issuances issued
JOIN postcard_collectible_releases releases ON releases.id = issued.release_id
JOIN postcard_collectible_sets sets ON sets.id = releases.set_id
JOIN postcard_collectible_variants variants ON variants.id = issued.variant_id
WHERE issued.owner_user_id IS NOT NULL
  AND issued.revoked_at IS NULL
  AND sets.state IN ('approved','retired')
  AND releases.state IN ('approved','active','sold_out','retired');

CREATE OR REPLACE VIEW postcard_collectible_set_progress_safe
WITH (security_barrier = TRUE) AS
WITH collector_sets AS (
  SELECT DISTINCT issued.owner_user_id, releases.set_id
  FROM postcard_collectible_issuances issued
  JOIN postcard_collectible_releases releases ON releases.id = issued.release_id
  WHERE issued.owner_user_id IS NOT NULL AND issued.revoked_at IS NULL
), requirements AS (
  SELECT set_id, COUNT(*)::INTEGER AS required_releases
  FROM postcard_collectible_releases
  WHERE required_for_completion
    AND state IN ('approved','active','sold_out','retired')
  GROUP BY set_id
), owned AS (
  SELECT issued.owner_user_id, releases.set_id,
         COUNT(DISTINCT issued.release_id)::INTEGER AS owned_releases
  FROM postcard_collectible_issuances issued
  JOIN postcard_collectible_releases releases ON releases.id = issued.release_id
  WHERE issued.owner_user_id IS NOT NULL
    AND issued.revoked_at IS NULL
    AND releases.required_for_completion
  GROUP BY issued.owner_user_id, releases.set_id
)
SELECT
  collector_sets.owner_user_id,
  sets.id AS set_id,
  sets.code AS set_code,
  sets.title AS set_title,
  sets.member_slug,
  COALESCE(owned.owned_releases, 0) AS owned_releases,
  COALESCE(requirements.required_releases, 0) AS required_releases,
  (
    COALESCE(requirements.required_releases, 0) > 0
    AND COALESCE(owned.owned_releases, 0) >= requirements.required_releases
  ) AS completed,
  completions.completed_at
FROM collector_sets
JOIN postcard_collectible_sets sets ON sets.id = collector_sets.set_id
LEFT JOIN requirements ON requirements.set_id = collector_sets.set_id
LEFT JOIN owned
  ON owned.owner_user_id = collector_sets.owner_user_id
  AND owned.set_id = collector_sets.set_id
LEFT JOIN postcard_collectible_set_completions completions
  ON completions.owner_user_id = collector_sets.owner_user_id
  AND completions.set_id = collector_sets.set_id
WHERE sets.state IN ('approved','retired');
