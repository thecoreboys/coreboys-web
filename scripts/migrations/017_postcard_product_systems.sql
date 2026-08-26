-- Postcard product systems: member-managed creative packs, immutable revisions,
-- scheduled drops, account drafts/proofs, multi-slot order art, explicit sharing,
-- recipient acknowledgements, and an append-only staff audit.
--
-- This migration is additive and idempotent. The application uses one database
-- role, so member isolation is represented explicitly by member_slug columns,
-- composite foreign keys, immutable publication records, and safe projection
-- views. API handlers must still derive member scope from the authenticated
-- staff row and include it in every query.

-- postcard_orders historically bootstraps lazily in lib/postcard-store.ts.
-- Create the same base shape here so a fresh database can apply this migration
-- before the first postcard request.
CREATE TABLE IF NOT EXISTS postcard_orders (
  id                              TEXT PRIMARY KEY,
  recipient_slug                  TEXT NOT NULL,
  message                         TEXT NOT NULL,
  design_id                       TEXT,
  image_url                       TEXT,
  sender_name                     TEXT,
  return_address                  JSONB,
  variation_seed                  TEXT,
  provider_mode                   TEXT NOT NULL DEFAULT 'sandbox',
  snapshot_version                INTEGER,
  identity_id                     TEXT,
  identity_version                INTEGER,
  archetype_id                    TEXT,
  template_id                     TEXT,
  renderer_version                INTEGER NOT NULL DEFAULT 1,
  variation_algorithm_version     INTEGER NOT NULL DEFAULT 1,
  resolved_variation              JSONB,
  creative_front_html             TEXT,
  creative_back_html              TEXT,
  creative_hash                   TEXT,
  amount_cents                    INTEGER NOT NULL,
  currency                        TEXT NOT NULL DEFAULT 'usd',
  status                          TEXT NOT NULL DEFAULT 'created',
  stripe_payment_intent           TEXT UNIQUE,
  provider_id                     TEXT,
  provider_url                    TEXT,
  status_token_hash               TEXT,
  fulfillment_attempts            INTEGER NOT NULL DEFAULT 0,
  last_fulfillment_error          TEXT,
  reviewed_by                     TEXT,
  reviewed_at                     TIMESTAMPTZ,
  moderation                      TEXT,
  tracking                        JSONB,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS postcard_design_packs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_slug           TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  state                 TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','active','retired')),
  published_revision_id UUID,
  created_by            UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  updated_by            UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_design_packs_member_slug_check
    CHECK (member_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT postcard_design_packs_slug_check
    CHECK (slug ~ '^[a-z][a-z0-9-]{0,79}$'),
  CONSTRAINT postcard_design_packs_title_check
    CHECK (length(BTRIM(title)) BETWEEN 1 AND 120),
  CONSTRAINT postcard_design_packs_description_check
    CHECK (description IS NULL OR length(description) <= 1000),
  UNIQUE (member_slug, slug),
  UNIQUE (id, member_slug)
);

CREATE TABLE IF NOT EXISTS postcard_pack_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         UUID NOT NULL REFERENCES postcard_design_packs(id) ON DELETE RESTRICT,
  version         INTEGER NOT NULL CHECK (version > 0),
  schema_version  INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  config          JSONB NOT NULL,
  content_hash    TEXT NOT NULL,
  state           TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','submitted','approved','rejected','published','superseded')),
  review_note     TEXT,
  created_by      UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  submitted_at    TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at     TIMESTAMPTZ,
  published_by    UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_pack_revisions_config_check
    CHECK (jsonb_typeof(config) = 'object' AND octet_length(config::TEXT) <= 262144),
  CONSTRAINT postcard_pack_revisions_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT postcard_pack_revisions_review_note_check
    CHECK (review_note IS NULL OR length(review_note) <= 2000),
  CONSTRAINT postcard_pack_revisions_review_state_check
    CHECK (
      (state IN ('draft','submitted') AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (state IN ('approved','rejected','published','superseded') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
  CONSTRAINT postcard_pack_revisions_publish_state_check
    CHECK (
      (state NOT IN ('published','superseded') AND published_by IS NULL AND published_at IS NULL)
      OR (state IN ('published','superseded') AND published_by IS NOT NULL AND published_at IS NOT NULL)
    ),
  UNIQUE (pack_id, version),
  UNIQUE (id, pack_id)
);

ALTER TABLE postcard_design_packs
  ADD COLUMN IF NOT EXISTS published_revision_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_design_packs'::regclass
       AND conname = 'postcard_design_packs_published_revision_fkey'
  ) THEN
    ALTER TABLE postcard_design_packs
      ADD CONSTRAINT postcard_design_packs_published_revision_fkey
      FOREIGN KEY (published_revision_id)
      REFERENCES postcard_pack_revisions(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS postcard_pack_assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id             UUID NOT NULL,
  member_slug         TEXT NOT NULL,
  kind                TEXT NOT NULL
    CHECK (kind IN ('sticker','texture','background','frame','overlay','mask','logo','photo')),
  storage_key         TEXT NOT NULL,
  public_url          TEXT,
  mime                TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  size_bytes          INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  width               INTEGER NOT NULL CHECK (width BETWEEN 1 AND 10000),
  height              INTEGER NOT NULL CHECK (height BETWEEN 1 AND 10000),
  sha256              TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  rights_source       TEXT NOT NULL DEFAULT 'unknown'
    CHECK (rights_source IN ('unknown','official','original','licensed')),
  rights_attested     BOOLEAN NOT NULL DEFAULT FALSE,
  attribution         TEXT,
  moderation_state    TEXT NOT NULL DEFAULT 'quarantined'
    CHECK (moderation_state IN ('quarantined','approved','rejected','retired')),
  moderation_note     TEXT,
  created_by          UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_by         UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_pack_assets_pack_scope_fkey
    FOREIGN KEY (pack_id, member_slug)
    REFERENCES postcard_design_packs(id, member_slug) ON DELETE RESTRICT,
  CONSTRAINT postcard_pack_assets_storage_key_check
    CHECK (
      length(storage_key) BETWEEN 1 AND 500
      AND LEFT(storage_key, 1) <> '/'
      AND position('..' IN storage_key) = 0
      AND position(E'\\' IN storage_key) = 0
    ),
  CONSTRAINT postcard_pack_assets_public_url_check
    CHECK (public_url IS NULL OR (length(public_url) <= 2048 AND public_url ~ '^https://')),
  CONSTRAINT postcard_pack_assets_attribution_check
    CHECK (attribution IS NULL OR length(attribution) <= 300),
  CONSTRAINT postcard_pack_assets_moderation_note_check
    CHECK (moderation_note IS NULL OR length(moderation_note) <= 2000),
  CONSTRAINT postcard_pack_assets_approval_check
    CHECK (
      moderation_state <> 'approved'
      OR (
        public_url IS NOT NULL
        AND rights_attested
        AND rights_source <> 'unknown'
        AND reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    ),
  UNIQUE (pack_id, kind, sha256)
);

CREATE TABLE IF NOT EXISTS postcard_drops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         UUID NOT NULL,
  revision_id     UUID NOT NULL,
  member_slug     TEXT NOT NULL,
  code            TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  state           TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','scheduled','cancelled','ended')),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  album_code      TEXT REFERENCES passport_albums(code) ON DELETE SET NULL,
  created_by      UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  updated_by      UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_drops_pack_scope_fkey
    FOREIGN KEY (pack_id, member_slug)
    REFERENCES postcard_design_packs(id, member_slug) ON DELETE RESTRICT,
  CONSTRAINT postcard_drops_revision_pack_fkey
    FOREIGN KEY (revision_id, pack_id)
    REFERENCES postcard_pack_revisions(id, pack_id) ON DELETE RESTRICT,
  CONSTRAINT postcard_drops_code_check
    CHECK (code ~ '^[a-z][a-z0-9-]{0,79}$'),
  CONSTRAINT postcard_drops_title_check
    CHECK (length(BTRIM(title)) BETWEEN 1 AND 120),
  CONSTRAINT postcard_drops_description_check
    CHECK (description IS NULL OR length(description) <= 1000),
  CONSTRAINT postcard_drops_window_check
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  UNIQUE (member_slug, code)
);

CREATE TABLE IF NOT EXISTS postcard_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  recipient_slug    TEXT NOT NULL,
  pack_revision_id  UUID REFERENCES postcard_pack_revisions(id) ON DELETE RESTRICT,
  title             TEXT,
  revision          INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  creative_state    JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT postcard_drafts_recipient_check
    CHECK (recipient_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT postcard_drafts_title_check
    CHECK (title IS NULL OR length(title) <= 120),
  CONSTRAINT postcard_drafts_state_check
    CHECK (jsonb_typeof(creative_state) = 'object' AND octet_length(creative_state::TEXT) <= 524288),
  UNIQUE (id, owner_user_id)
);

CREATE TABLE IF NOT EXISTS postcard_proof_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        UUID NOT NULL,
  owner_user_id   TEXT NOT NULL,
  draft_revision  INTEGER NOT NULL CHECK (draft_revision > 0),
  token_hash      TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  access_count    INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  last_accessed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_proof_links_draft_owner_fkey
    FOREIGN KEY (draft_id, owner_user_id)
    REFERENCES postcard_drafts(id, owner_user_id) ON DELETE CASCADE,
  CONSTRAINT postcard_proof_links_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT postcard_proof_links_revoke_check
    CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT postcard_proof_links_access_check
    CHECK (
      (access_count = 0 AND last_accessed_at IS NULL)
      OR (access_count > 0 AND last_accessed_at >= created_at)
    )
);

ALTER TABLE postcard_orders
  ADD COLUMN IF NOT EXISTS fan_user_id TEXT,
  ADD COLUMN IF NOT EXISTS pack_id UUID,
  ADD COLUMN IF NOT EXISTS pack_revision_id UUID,
  ADD COLUMN IF NOT EXISTS pack_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS passport_card_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS postcard_orders_id_recipient_uniq
  ON postcard_orders (id, recipient_slug);
CREATE UNIQUE INDEX IF NOT EXISTS postcard_orders_id_fan_user_uniq
  ON postcard_orders (id, fan_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_fan_user_fkey'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_fan_user_fkey
      FOREIGN KEY (fan_user_id) REFERENCES fan_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_pack_revision_fkey'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_pack_revision_fkey
      FOREIGN KEY (pack_revision_id, pack_id)
      REFERENCES postcard_pack_revisions(id, pack_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_passport_card_fkey'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_passport_card_fkey
      FOREIGN KEY (passport_card_id) REFERENCES passport_cards(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'postcard_orders'::regclass
       AND conname = 'postcard_orders_pack_snapshot_check'
  ) THEN
    ALTER TABLE postcard_orders
      ADD CONSTRAINT postcard_orders_pack_snapshot_check
      CHECK (
        (pack_id IS NULL AND pack_revision_id IS NULL AND pack_content_hash IS NULL)
        OR (
          pack_id IS NOT NULL
          AND pack_revision_id IS NOT NULL
          AND pack_content_hash ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS postcard_order_images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          TEXT NOT NULL REFERENCES postcard_orders(id) ON DELETE CASCADE,
  slot_index        INTEGER NOT NULL CHECK (slot_index BETWEEN 0 AND 11),
  sort_order        INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 99),
  source_kind       TEXT NOT NULL DEFAULT 'upload'
    CHECK (source_kind IN ('upload','core_media','instagram','video_frame')),
  source_ref        TEXT,
  storage_key       TEXT NOT NULL,
  mime              TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  size_bytes        INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  width             INTEGER NOT NULL CHECK (width BETWEEN 1 AND 10000),
  height            INTEGER NOT NULL CHECK (height BETWEEN 1 AND 10000),
  sha256            TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  crop_state        JSONB NOT NULL DEFAULT '{}'::JSONB,
  moderation_state  TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_state IN ('pending','approved','rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_order_images_source_ref_check
    CHECK (source_ref IS NULL OR length(source_ref) <= 500),
  CONSTRAINT postcard_order_images_storage_key_check
    CHECK (
      length(storage_key) BETWEEN 1 AND 500
      AND LEFT(storage_key, 1) <> '/'
      AND position('..' IN storage_key) = 0
      AND position(E'\\' IN storage_key) = 0
    ),
  CONSTRAINT postcard_order_images_crop_check
    CHECK (jsonb_typeof(crop_state) = 'object' AND octet_length(crop_state::TEXT) <= 16384),
  UNIQUE (order_id, slot_index)
);

CREATE TABLE IF NOT EXISTS postcard_sharing_choices (
  order_id          TEXT PRIMARY KEY REFERENCES postcard_orders(id) ON DELETE CASCADE,
  owner_user_id     TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  visibility        TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','anonymous','credited')),
  show_sender       BOOLEAN NOT NULL DEFAULT FALSE,
  show_message      BOOLEAN NOT NULL DEFAULT FALSE,
  show_artwork      BOOLEAN NOT NULL DEFAULT FALSE,
  policy_version    TEXT NOT NULL,
  consented_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_sharing_choices_policy_check
    CHECK (length(BTRIM(policy_version)) BETWEEN 1 AND 80),
  CONSTRAINT postcard_sharing_choices_private_check
    CHECK (
      visibility <> 'private'
      OR (NOT show_sender AND NOT show_message AND NOT show_artwork)
    ),
  CONSTRAINT postcard_sharing_choices_anonymous_check
    CHECK (visibility <> 'anonymous' OR NOT show_sender),
  CONSTRAINT postcard_sharing_choices_withdrawn_check
    CHECK (
      withdrawn_at IS NULL
      OR (
        withdrawn_at >= consented_at
        AND visibility = 'private'
        AND NOT show_sender
        AND NOT show_message
        AND NOT show_artwork
      )
    )
);

CREATE TABLE IF NOT EXISTS postcard_recipient_acknowledgements (
  order_id          TEXT PRIMARY KEY,
  member_slug       TEXT NOT NULL,
  reaction          TEXT NOT NULL CHECK (reaction IN ('seen','heart','thank_you')),
  visible_to_sender BOOLEAN NOT NULL DEFAULT TRUE,
  actor_id          UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_recipient_acknowledgements_order_scope_fkey
    FOREIGN KEY (order_id, member_slug)
    REFERENCES postcard_orders(id, recipient_slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS postcard_staff_audit (
  id            BIGSERIAL PRIMARY KEY,
  actor_id      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_email   TEXT NOT NULL,
  action        TEXT NOT NULL,
  member_slug   TEXT,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  reason        TEXT,
  previous      JSONB,
  next          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postcard_staff_audit_actor_email_check
    CHECK (length(actor_email) BETWEEN 3 AND 320),
  CONSTRAINT postcard_staff_audit_action_check
    CHECK (action ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  CONSTRAINT postcard_staff_audit_member_slug_check
    CHECK (member_slug IS NULL OR member_slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  CONSTRAINT postcard_staff_audit_entity_type_check
    CHECK (entity_type ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  CONSTRAINT postcard_staff_audit_entity_id_check
    CHECK (entity_id IS NULL OR length(entity_id) <= 200),
  CONSTRAINT postcard_staff_audit_reason_check
    CHECK (reason IS NULL OR length(reason) <= 2000),
  CONSTRAINT postcard_staff_audit_payload_check
    CHECK (
      (previous IS NULL OR octet_length(previous::TEXT) <= 1048576)
      AND (next IS NULL OR octet_length(next::TEXT) <= 1048576)
    )
);

CREATE INDEX IF NOT EXISTS postcard_design_packs_scope_idx
  ON postcard_design_packs (member_slug, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS postcard_pack_revisions_pack_idx
  ON postcard_pack_revisions (pack_id, version DESC);
CREATE INDEX IF NOT EXISTS postcard_pack_revisions_review_idx
  ON postcard_pack_revisions (state, submitted_at, created_at)
  WHERE state IN ('submitted','approved');
CREATE INDEX IF NOT EXISTS postcard_pack_assets_scope_idx
  ON postcard_pack_assets (member_slug, moderation_state, created_at DESC);
CREATE INDEX IF NOT EXISTS postcard_drops_active_idx
  ON postcard_drops (member_slug, starts_at, ends_at)
  WHERE state = 'scheduled';
CREATE INDEX IF NOT EXISTS postcard_drafts_owner_idx
  ON postcard_drafts (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS postcard_proof_links_active_idx
  ON postcard_proof_links (expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS postcard_orders_fan_user_idx
  ON postcard_orders (fan_user_id, created_at DESC)
  WHERE fan_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS postcard_orders_pack_idx
  ON postcard_orders (pack_revision_id, created_at DESC)
  WHERE pack_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS postcard_order_images_order_idx
  ON postcard_order_images (order_id, sort_order, slot_index);
CREATE INDEX IF NOT EXISTS postcard_recipient_acknowledgements_member_idx
  ON postcard_recipient_acknowledgements (member_slug, updated_at DESC);
CREATE INDEX IF NOT EXISTS postcard_staff_audit_scope_idx
  ON postcard_staff_audit (member_slug, entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION postcard_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'postcard_design_packs',
    'postcard_pack_revisions',
    'postcard_pack_assets',
    'postcard_drops',
    'postcard_drafts',
    'postcard_sharing_choices',
    'postcard_recipient_acknowledgements'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS postcard_touch_updated_at ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER postcard_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION postcard_touch_updated_at()',
      table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION protect_postcard_design_pack_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  transition_allowed BOOLEAN;
BEGIN
  IF NEW.member_slug IS DISTINCT FROM OLD.member_slug
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'postcard design pack ownership and member scope are immutable';
  END IF;

  transition_allowed := CASE OLD.state
    WHEN 'draft' THEN NEW.state IN ('draft','active','retired')
    WHEN 'active' THEN NEW.state IN ('active','retired')
    WHEN 'retired' THEN NEW.state = 'retired'
    ELSE FALSE
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'illegal postcard design pack transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF OLD.state IN ('active','retired') AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'published postcard design pack slug is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_design_pack_scope_guard ON postcard_design_packs;
CREATE TRIGGER postcard_design_pack_scope_guard
BEFORE UPDATE ON postcard_design_packs
FOR EACH ROW EXECUTE FUNCTION protect_postcard_design_pack_scope();

CREATE OR REPLACE FUNCTION protect_postcard_pack_revision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  transition_allowed BOOLEAN;
BEGIN
  transition_allowed := CASE OLD.state
    WHEN 'draft' THEN NEW.state IN ('draft','submitted')
    WHEN 'submitted' THEN NEW.state IN ('submitted','draft','approved','rejected')
    WHEN 'rejected' THEN NEW.state IN ('rejected','draft')
    WHEN 'approved' THEN NEW.state IN ('approved','published','rejected')
    WHEN 'published' THEN NEW.state IN ('published','superseded')
    WHEN 'superseded' THEN NEW.state = 'superseded'
    ELSE FALSE
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'illegal postcard pack revision transition: % -> %', OLD.state, NEW.state;
  END IF;
  IF OLD.state IN ('submitted','approved','published','superseded') AND (
    NEW.pack_id IS DISTINCT FROM OLD.pack_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.config IS DISTINCT FROM OLD.config
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'submitted postcard pack revision content is immutable';
  END IF;
  IF OLD.state IN ('published','superseded') AND (
    NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.published_by IS DISTINCT FROM OLD.published_by
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
  ) THEN
    RAISE EXCEPTION 'published postcard pack provenance is immutable';
  END IF;
  IF OLD.state = 'published' AND NEW.state = 'superseded' AND EXISTS (
    SELECT 1 FROM postcard_design_packs packs
     WHERE packs.published_revision_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'current postcard pack revision cannot be superseded before the pack pointer moves';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_pack_revision_guard ON postcard_pack_revisions;
CREATE TRIGGER postcard_pack_revision_guard
BEFORE UPDATE ON postcard_pack_revisions
FOR EACH ROW EXECUTE FUNCTION protect_postcard_pack_revision();

CREATE OR REPLACE FUNCTION prevent_postcard_pack_revision_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'submitted or published postcard pack revisions cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS postcard_pack_revision_delete_guard ON postcard_pack_revisions;
CREATE TRIGGER postcard_pack_revision_delete_guard
BEFORE DELETE ON postcard_pack_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_postcard_pack_revision_delete();

CREATE OR REPLACE FUNCTION validate_postcard_pack_publication()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  revision_pack UUID;
  revision_state TEXT;
BEGIN
  IF NEW.published_revision_id IS NULL THEN
    IF NEW.state = 'active' THEN
      RAISE EXCEPTION 'active postcard pack requires a published revision';
    END IF;
    RETURN NEW;
  END IF;
  SELECT pack_id, state INTO revision_pack, revision_state
    FROM postcard_pack_revisions WHERE id = NEW.published_revision_id;
  IF revision_pack IS NULL OR revision_pack <> NEW.id OR revision_state <> 'published' THEN
    RAISE EXCEPTION 'postcard pack published revision must be a published revision of that pack';
  END IF;
  IF NEW.state <> 'active' THEN
    RAISE EXCEPTION 'postcard pack with a published revision must be active';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_pack_publication_guard ON postcard_design_packs;
CREATE TRIGGER postcard_pack_publication_guard
BEFORE INSERT OR UPDATE OF state, published_revision_id ON postcard_design_packs
FOR EACH ROW EXECUTE FUNCTION validate_postcard_pack_publication();

CREATE OR REPLACE FUNCTION protect_approved_postcard_asset()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  transition_allowed BOOLEAN;
BEGIN
  transition_allowed := CASE OLD.moderation_state
    WHEN 'quarantined' THEN NEW.moderation_state IN ('quarantined','approved','rejected')
    WHEN 'rejected' THEN NEW.moderation_state IN ('rejected','quarantined')
    WHEN 'approved' THEN NEW.moderation_state IN ('approved','retired')
    WHEN 'retired' THEN NEW.moderation_state = 'retired'
    ELSE FALSE
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'illegal postcard asset transition: % -> %', OLD.moderation_state, NEW.moderation_state;
  END IF;
  IF OLD.moderation_state IN ('approved','retired') AND (
    NEW.pack_id IS DISTINCT FROM OLD.pack_id
    OR NEW.member_slug IS DISTINCT FROM OLD.member_slug
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
    OR NEW.public_url IS DISTINCT FROM OLD.public_url
    OR NEW.mime IS DISTINCT FROM OLD.mime
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.width IS DISTINCT FROM OLD.width
    OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.rights_source IS DISTINCT FROM OLD.rights_source
    OR NEW.rights_attested IS DISTINCT FROM OLD.rights_attested
    OR NEW.attribution IS DISTINCT FROM OLD.attribution
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'approved postcard asset bytes and rights provenance are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_pack_asset_guard ON postcard_pack_assets;
CREATE TRIGGER postcard_pack_asset_guard
BEFORE UPDATE ON postcard_pack_assets
FOR EACH ROW EXECUTE FUNCTION protect_approved_postcard_asset();

CREATE OR REPLACE FUNCTION prevent_approved_postcard_asset_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.moderation_state IN ('approved','retired') THEN
    RAISE EXCEPTION 'approved or retired postcard assets cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS postcard_pack_asset_delete_guard ON postcard_pack_assets;
CREATE TRIGGER postcard_pack_asset_delete_guard
BEFORE DELETE ON postcard_pack_assets
FOR EACH ROW EXECUTE FUNCTION prevent_approved_postcard_asset_delete();

CREATE OR REPLACE FUNCTION validate_postcard_drop_revision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  revision_state TEXT;
  transition_allowed BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    transition_allowed := CASE OLD.state
      WHEN 'draft' THEN NEW.state IN ('draft','scheduled','cancelled')
      WHEN 'scheduled' THEN NEW.state IN ('scheduled','cancelled','ended')
      WHEN 'cancelled' THEN NEW.state = 'cancelled'
      WHEN 'ended' THEN NEW.state = 'ended'
      ELSE FALSE
    END;
    IF NOT transition_allowed THEN
      RAISE EXCEPTION 'illegal postcard drop transition: % -> %', OLD.state, NEW.state;
    END IF;
  END IF;
  IF NEW.state = 'scheduled' THEN
    SELECT state INTO revision_state
      FROM postcard_pack_revisions
     WHERE id = NEW.revision_id AND pack_id = NEW.pack_id;
    IF revision_state IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'scheduled postcard drop requires a published pack revision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_drop_revision_guard ON postcard_drops;
CREATE TRIGGER postcard_drop_revision_guard
BEFORE INSERT OR UPDATE OF state, revision_id, pack_id ON postcard_drops
FOR EACH ROW EXECUTE FUNCTION validate_postcard_drop_revision();

CREATE OR REPLACE FUNCTION validate_postcard_sharing_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  order_owner TEXT;
BEGIN
  SELECT fan_user_id INTO order_owner
    FROM postcard_orders WHERE id = NEW.order_id;
  IF order_owner IS NULL OR order_owner <> NEW.owner_user_id THEN
    RAISE EXCEPTION 'postcard sharing choice must belong to the signed-in order owner';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_sharing_owner_guard ON postcard_sharing_choices;
CREATE TRIGGER postcard_sharing_owner_guard
BEFORE INSERT OR UPDATE OF order_id, owner_user_id ON postcard_sharing_choices
FOR EACH ROW EXECUTE FUNCTION validate_postcard_sharing_owner();

CREATE OR REPLACE FUNCTION protect_postcard_proof_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.draft_id IS DISTINCT FROM OLD.draft_id
    OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.draft_revision IS DISTINCT FROM OLD.draft_revision
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'postcard proof identity and expiry are immutable; create a new link instead';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'revoked postcard proof cannot be reactivated';
  END IF;
  IF NEW.access_count < OLD.access_count THEN
    RAISE EXCEPTION 'postcard proof access count cannot decrease';
  END IF;
  IF OLD.last_accessed_at IS NOT NULL AND (
    NEW.last_accessed_at IS NULL OR NEW.last_accessed_at < OLD.last_accessed_at
  ) THEN
    RAISE EXCEPTION 'postcard proof last access time cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS postcard_proof_link_guard ON postcard_proof_links;
CREATE TRIGGER postcard_proof_link_guard
BEFORE UPDATE ON postcard_proof_links
FOR EACH ROW EXECUTE FUNCTION protect_postcard_proof_link();

CREATE OR REPLACE FUNCTION prevent_postcard_staff_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'postcard_staff_audit is append-only';
END;
$$;
DROP TRIGGER IF EXISTS postcard_staff_audit_no_mutation ON postcard_staff_audit;
CREATE TRIGGER postcard_staff_audit_no_mutation
BEFORE UPDATE OR DELETE ON postcard_staff_audit
FOR EACH ROW EXECUTE FUNCTION prevent_postcard_staff_audit_mutation();

-- Member-facing code should query this safe projection instead of selecting
-- postcard_orders directly. It deliberately omits addresses, email/account
-- identifiers, payment/provider IDs, access-token hashes, and creative HTML.
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
  (orders.image_url IS NOT NULL OR EXISTS (
    SELECT 1 FROM postcard_order_images images WHERE images.order_id = orders.id
  )) AS has_custom_art,
  orders.created_at,
  orders.updated_at
FROM postcard_orders orders
WHERE orders.status IN ('printing','mailed','sent')
  AND COALESCE(orders.moderation, 'passed') = 'passed';

-- Aggregate-only member analytics. No sender, account, message, image, address,
-- payment, or provider identifiers are projected.
CREATE OR REPLACE VIEW postcard_member_analytics_daily
WITH (security_barrier = TRUE) AS
SELECT
  orders.recipient_slug AS member_slug,
  orders.created_at::DATE AS day,
  orders.pack_id,
  orders.pack_revision_id,
  orders.design_id,
  COUNT(*)::BIGINT AS orders_started,
  COUNT(*) FILTER (WHERE orders.status IN ('paid','review','fulfilling','proof','printing','mailed','sent'))::BIGINT AS orders_paid,
  COUNT(*) FILTER (WHERE orders.status IN ('printing','mailed','sent'))::BIGINT AS orders_accepted,
  COUNT(*) FILTER (WHERE orders.status = 'refunded')::BIGINT AS orders_refunded,
  COUNT(acknowledgements.order_id)::BIGINT AS orders_acknowledged
FROM postcard_orders orders
LEFT JOIN postcard_recipient_acknowledgements acknowledgements
  ON acknowledgements.order_id = orders.id
GROUP BY
  orders.recipient_slug,
  orders.created_at::DATE,
  orders.pack_id,
  orders.pack_revision_id,
  orders.design_id;
