-- CORE Passport: channel progression, achievements, live memories, collectibles,
-- cosmetics, and the guarded social collection layer.
--
-- This migration is additive and idempotent. The passport_ledger is the
-- canonical, append-only history. Other passport_* tables are projections or
-- workflow state and may only be mutated by server-authoritative services.

CREATE TABLE IF NOT EXISTS passport_profiles (
  user_id text PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  global_xp integer NOT NULL DEFAULT 0 CHECK (global_xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  sparks integer NOT NULL DEFAULT 0 CHECK (sparks >= 0),
  display_title text,
  active_loadout_scope text NOT NULL DEFAULT 'global',
  exchange_enabled boolean NOT NULL DEFAULT false,
  showcase_card_ids uuid[] NOT NULL DEFAULT '{}',
  showcase_achievement_codes text[] NOT NULL DEFAULT '{}',
  privacy jsonb NOT NULL DEFAULT '{"profile":"public","inventory":"private","activity":"private","channelAffinity":"public"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE passport_profiles ADD COLUMN IF NOT EXISTS exchange_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS passport_channel_progress (
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  channel_slug text NOT NULL,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  watch_seconds bigint NOT NULL DEFAULT 0 CHECK (watch_seconds >= 0),
  events_attended integer NOT NULL DEFAULT 0 CHECK (events_attended >= 0),
  last_active_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_slug)
);
CREATE INDEX IF NOT EXISTS passport_channel_progress_channel_idx
  ON passport_channel_progress (channel_slug, xp DESC);

CREATE TABLE IF NOT EXISTS passport_watch_credit_cursors (
  user_id text PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
  last_playback_ref text NOT NULL CHECK (length(last_playback_ref) BETWEEN 1 AND 200),
  last_tick_at timestamptz NOT NULL,
  last_completion_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_watch_sessions (
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  playback_ref text NOT NULL CHECK (length(playback_ref) BETWEEN 1 AND 200),
  channel_slug text,
  last_position_seconds integer NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  credited_seconds integer NOT NULL DEFAULT 0 CHECK (credited_seconds >= 0),
  projected_seconds integer NOT NULL DEFAULT 0 CHECK (projected_seconds >= 0),
  completion_requested_at timestamptz,
  completion_projected_at timestamptz,
  last_tick_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, playback_ref),
  CHECK (projected_seconds <= credited_seconds)
);

CREATE TABLE IF NOT EXISTS passport_watch_assets (
  playback_ref text PRIMARY KEY CHECK (length(playback_ref) BETWEEN 1 AND 200),
  platform text NOT NULL CHECK (length(platform) BETWEEN 2 AND 40),
  aliases text[] NOT NULL DEFAULT '{}',
  channel_slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('live','youtube','vod','clip','tour')),
  short_form boolean NOT NULL DEFAULT false,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  source_url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE passport_watch_assets ADD COLUMN IF NOT EXISTS short_form boolean NOT NULL DEFAULT false;
ALTER TABLE passport_watch_assets DROP CONSTRAINT IF EXISTS passport_watch_assets_kind_check;
ALTER TABLE passport_watch_assets ADD CONSTRAINT passport_watch_assets_kind_check
  CHECK (kind IN ('live','youtube','vod','clip','tour'));
CREATE INDEX IF NOT EXISTS passport_watch_assets_aliases_idx ON passport_watch_assets USING gin(aliases);
CREATE INDEX IF NOT EXISTS passport_watch_assets_recent_idx ON passport_watch_assets(platform,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS passport_achievement_definitions (
  code text PRIMARY KEY,
  channel_slug text,
  family text NOT NULL CHECK (family IN ('attendance','knowledge','participation','collection','community','legacy','secret')),
  name text NOT NULL,
  description text NOT NULL,
  tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','icon')),
  icon text,
  threshold integer NOT NULL DEFAULT 1 CHECK (threshold > 0),
  metric text NOT NULL,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_achievement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  achievement_code text NOT NULL REFERENCES passport_achievement_definitions(code),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  state text NOT NULL DEFAULT 'progress' CHECK (state IN ('progress','active','revoked')),
  grant_key text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  earned_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  UNIQUE (user_id, achievement_code),
  UNIQUE (grant_key)
);
CREATE INDEX IF NOT EXISTS passport_achievement_grants_user_idx
  ON passport_achievement_grants (user_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS passport_quest_definitions (
  code text PRIMARY KEY,
  campaign_code text,
  channel_slug text,
  name text NOT NULL,
  description text NOT NULL,
  objective jsonb NOT NULL,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  repeatable boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_quest_progress (
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  quest_code text NOT NULL REFERENCES passport_quest_definitions(code),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','completed','claimed','expired','revoked')),
  completion_count integer NOT NULL DEFAULT 0 CHECK (completion_count >= 0),
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quest_code)
);

CREATE TABLE IF NOT EXISTS passport_community_goals (
  code text PRIMARY KEY,
  channel_slug text,
  name text NOT NULL,
  description text NOT NULL,
  metric text NOT NULL,
  target bigint NOT NULL CHECK (target > 0),
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_community_goal_progress (
  goal_code text PRIMARY KEY REFERENCES passport_community_goals(code) ON DELETE CASCADE,
  total bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','completed','retired')),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_community_goal_contributions (
  id bigserial PRIMARY KEY,
  goal_code text NOT NULL REFERENCES passport_community_goals(code) ON DELETE CASCADE,
  user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
  contribution_key text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount > 0),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE passport_community_goal_contributions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE passport_community_goal_contributions ADD COLUMN IF NOT EXISTS revoked_reason text;
CREATE INDEX IF NOT EXISTS passport_community_goal_contributions_goal_idx
  ON passport_community_goal_contributions (goal_code, created_at DESC);

CREATE TABLE IF NOT EXISTS passport_community_goal_claims (
  goal_code text NOT NULL REFERENCES passport_community_goals(code) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  grant_key text NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_code, user_id)
);

CREATE TABLE IF NOT EXISTS passport_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  network_slug text NOT NULL DEFAULT 'core',
  channel_slug text NOT NULL,
  title text NOT NULL,
  description text,
  external_ref text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','scheduled','live','ended','certified','frozen','cancelled')),
  attendance_grace_seconds integer NOT NULL DEFAULT 300 CHECK (attendance_grace_seconds BETWEEN 0 AND 86400),
  minimum_watch_seconds integer NOT NULL DEFAULT 120 CHECK (minimum_watch_seconds BETWEEN 0 AND 86400),
  heartbeat_interval_seconds integer NOT NULL DEFAULT 30 CHECK (heartbeat_interval_seconds BETWEEN 10 AND 300),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  certified_by text,
  certified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_events_schedule_idx
  ON passport_events (starts_at DESC, channel_slug);

CREATE TABLE IF NOT EXISTS passport_event_presence (
  event_id uuid NOT NULL REFERENCES passport_events(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  watch_seconds integer NOT NULL DEFAULT 0 CHECK (watch_seconds >= 0),
  heartbeat_count integer NOT NULL DEFAULT 0 CHECK (heartbeat_count >= 0),
  proof_hash text,
  state text NOT NULL DEFAULT 'observed' CHECK (state IN ('observed','eligible','verified','rejected','revoked')),
  verified_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS passport_event_presence_user_idx
  ON passport_event_presence (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS passport_presence_heartbeats (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES passport_events(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  playback_ref text NOT NULL,
  playback_position_seconds integer NOT NULL CHECK (playback_position_seconds >= 0),
  playing boolean NOT NULL,
  visible boolean NOT NULL,
  credited_seconds integer NOT NULL DEFAULT 0 CHECK (credited_seconds BETWEEN 0 AND 600),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_presence_heartbeats_eligibility_idx
  ON passport_presence_heartbeats (event_id, user_id, received_at DESC);

CREATE TABLE IF NOT EXISTS passport_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES passport_events(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  offset_seconds integer NOT NULL CHECK (offset_seconds >= 0),
  eligibility_before_seconds integer NOT NULL DEFAULT 300 CHECK (eligibility_before_seconds BETWEEN 0 AND 86400),
  eligibility_after_seconds integer NOT NULL DEFAULT 180 CHECK (eligibility_after_seconds BETWEEN 0 AND 86400),
  minimum_presence_seconds integer NOT NULL DEFAULT 120 CHECK (minimum_presence_seconds BETWEEN 0 AND 86400),
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','historic','legendary')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','sealed','revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  published_by text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS passport_card_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  moment_id uuid REFERENCES passport_moments(id) ON DELETE SET NULL,
  event_id uuid REFERENCES passport_events(id) ON DELETE SET NULL,
  channel_slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  artwork_url text,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','historic','legendary')),
  variant text NOT NULL DEFAULT 'base',
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','sealed','retired','revoked')),
  account_bound boolean NOT NULL DEFAULT true,
  giftable boolean NOT NULL DEFAULT false,
  tradeable boolean NOT NULL DEFAULT false,
  craft_value integer NOT NULL DEFAULT 0 CHECK (craft_value >= 0),
  max_supply integer CHECK (max_supply IS NULL OR max_supply > 0),
  edition_size integer CHECK (edition_size IS NULL OR edition_size >= 0),
  sealed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_card_editions_event_idx
  ON passport_card_editions (event_id, state);

CREATE OR REPLACE FUNCTION prevent_sealed_passport_edition_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='published' AND NEW.state NOT IN ('published','sealed') THEN
    RAISE EXCEPTION 'published passport edition cannot leave the publish lifecycle';
  END IF;
  IF OLD.state='sealed' AND (
    NEW.edition_size IS DISTINCT FROM OLD.edition_size OR
    NEW.sealed_at IS DISTINCT FROM OLD.sealed_at OR
    NEW.state IS DISTINCT FROM OLD.state
  ) THEN
    RAISE EXCEPTION 'sealed passport edition supply is immutable';
  END IF;
  IF OLD.state IN ('published','sealed') AND (
    NEW.code IS DISTINCT FROM OLD.code OR
    NEW.moment_id IS DISTINCT FROM OLD.moment_id OR
    NEW.event_id IS DISTINCT FROM OLD.event_id OR
    NEW.channel_slug IS DISTINCT FROM OLD.channel_slug OR
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.artwork_url IS DISTINCT FROM OLD.artwork_url OR
    NEW.rarity IS DISTINCT FROM OLD.rarity OR
    NEW.variant IS DISTINCT FROM OLD.variant OR
    NEW.account_bound IS DISTINCT FROM OLD.account_bound OR
    NEW.giftable IS DISTINCT FROM OLD.giftable OR
    NEW.tradeable IS DISTINCT FROM OLD.tradeable OR
    NEW.craft_value IS DISTINCT FROM OLD.craft_value OR
    NEW.max_supply IS DISTINCT FROM OLD.max_supply OR
    NEW.metadata IS DISTINCT FROM OLD.metadata OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'published passport edition provenance and collection policy are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS passport_card_editions_immutable ON passport_card_editions;
CREATE TRIGGER passport_card_editions_immutable
BEFORE UPDATE ON passport_card_editions
FOR EACH ROW EXECUTE FUNCTION prevent_sealed_passport_edition_mutation();

CREATE TABLE IF NOT EXISTS passport_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES passport_card_editions(id),
  owner_user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
  original_user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
  serial_number integer,
  claim_key text NOT NULL UNIQUE,
  acquired_via text NOT NULL CHECK (acquired_via IN ('attendance','moment','achievement','quest','grant','gift','trade','craft','restoration')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','locked','escrowed','crafted','revoked')),
  lock_reason text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX IF NOT EXISTS passport_cards_owner_idx
  ON passport_cards (owner_user_id, acquired_at DESC, id DESC)
  WHERE state IN ('active','locked','escrowed');
CREATE UNIQUE INDEX IF NOT EXISTS passport_cards_edition_serial_uniq
  ON passport_cards (edition_id, serial_number)
  WHERE serial_number IS NOT NULL;

ALTER TABLE passport_cards ALTER COLUMN original_user_id DROP NOT NULL;
ALTER TABLE passport_cards ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE passport_cards DROP CONSTRAINT IF EXISTS passport_cards_owner_user_id_fkey;
ALTER TABLE passport_cards ADD CONSTRAINT passport_cards_owner_user_id_fkey
  FOREIGN KEY(owner_user_id) REFERENCES fan_users(id) ON DELETE SET NULL;
ALTER TABLE passport_cards DROP CONSTRAINT IF EXISTS passport_cards_original_user_id_fkey;
ALTER TABLE passport_cards ADD CONSTRAINT passport_cards_original_user_id_fkey
  FOREIGN KEY(original_user_id) REFERENCES fan_users(id) ON DELETE SET NULL;
UPDATE passport_cards SET state='revoked',lock_reason=NULL,
  revoked_at=COALESCE(revoked_at,now()),revoked_reason=COALESCE(revoked_reason,'owner_missing'),updated_at=now()
WHERE owner_user_id IS NULL AND state IN('active','locked','escrowed');
ALTER TABLE passport_cards DROP CONSTRAINT IF EXISTS passport_cards_owner_state_check;
ALTER TABLE passport_cards ADD CONSTRAINT passport_cards_owner_state_check
  CHECK(owner_user_id IS NOT NULL OR state IN('revoked','crafted'));

CREATE TABLE IF NOT EXISTS passport_albums (
  code text PRIMARY KEY,
  channel_slug text,
  name text NOT NULL,
  description text NOT NULL,
  artwork_url text,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_album_slots (
  album_code text NOT NULL REFERENCES passport_albums(code) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES passport_card_editions(id) ON DELETE CASCADE,
  slot_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (album_code, edition_id)
);

CREATE TABLE IF NOT EXISTS passport_album_completions (
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  album_code text NOT NULL REFERENCES passport_albums(code) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'eligible' CHECK (state IN ('eligible','claimed','revoked')),
  completed_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  grant_key text UNIQUE,
  PRIMARY KEY (user_id, album_code)
);

CREATE TABLE IF NOT EXISTS passport_cosmetics (
  code text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('title','nameplate','frame','theme','reaction','avatar_frame','card_back')),
  channel_slug text,
  name text NOT NULL,
  description text NOT NULL,
  asset jsonb NOT NULL DEFAULT '{}'::jsonb,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','historic','legendary')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_cosmetic_unlocks (
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  cosmetic_code text NOT NULL REFERENCES passport_cosmetics(code),
  grant_key text NOT NULL UNIQUE,
  source_type text NOT NULL,
  source_id text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','revoked')),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, cosmetic_code)
);

CREATE TABLE IF NOT EXISTS passport_loadouts (
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  title_code text REFERENCES passport_cosmetics(code),
  nameplate_code text REFERENCES passport_cosmetics(code),
  frame_code text REFERENCES passport_cosmetics(code),
  theme_code text REFERENCES passport_cosmetics(code),
  reaction_codes text[] NOT NULL DEFAULT '{}',
  featured_card_id uuid REFERENCES passport_cards(id) ON DELETE SET NULL,
  badge_codes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);

CREATE TABLE IF NOT EXISTS passport_crafting_recipes (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  input_count integer NOT NULL CHECK (input_count BETWEEN 1 AND 100),
  input_rarity text,
  input_channel_slug text,
  output_type text NOT NULL CHECK (output_type IN ('cosmetic','sparks')),
  output_code text,
  output_amount integer NOT NULL DEFAULT 1 CHECK (output_amount > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT passport_crafting_recipes_output_check CHECK (
    NOT active OR (output_type='cosmetic' AND output_code IS NOT NULL)
    OR (output_type='sparks' AND output_code IS NULL)
  )
);

UPDATE passport_crafting_recipes SET active=false WHERE output_type='cosmetic' AND output_code IS NULL;
UPDATE passport_crafting_recipes SET output_code=NULL WHERE output_type='sparks' AND output_code IS NOT NULL;
ALTER TABLE passport_crafting_recipes DROP CONSTRAINT IF EXISTS passport_crafting_recipes_output_check;
ALTER TABLE passport_crafting_recipes ADD CONSTRAINT passport_crafting_recipes_output_check CHECK (
  NOT active OR (output_type='cosmetic' AND output_code IS NOT NULL)
  OR (output_type='sparks' AND output_code IS NULL)
);

CREATE TABLE IF NOT EXISTS passport_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL UNIQUE,
  card_id uuid NOT NULL REFERENCES passport_cards(id),
  sender_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  message text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','declined','cancelled','expired','revoked')),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_user_id <> recipient_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS passport_gifts_pending_card_uniq
  ON passport_gifts (card_id) WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS passport_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL UNIQUE,
  proposer_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  message text,
  proposer_confirmed boolean NOT NULL DEFAULT false,
  recipient_confirmed boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','awaiting_confirmation','cooling_off','completed','declined','cancelled','expired','revoked')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  executes_at timestamptz,
  completed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (proposer_user_id <> recipient_user_id)
);

CREATE TABLE IF NOT EXISTS passport_trade_items (
  trade_id uuid NOT NULL REFERENCES passport_trades(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES passport_cards(id),
  side text NOT NULL CHECK (side IN ('offered','requested')),
  owner_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  released_at timestamptz,
  PRIMARY KEY (trade_id, card_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS passport_trade_items_pending_card_uniq
  ON passport_trade_items (card_id) WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION release_passport_locks_before_fan_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE passport_cards c SET state='active',lock_reason=NULL,updated_at=now()
   WHERE c.owner_user_id<>OLD.id AND c.state='locked' AND (
     EXISTS(SELECT 1 FROM passport_gifts g
       WHERE g.state='pending' AND (g.sender_user_id=OLD.id OR g.recipient_user_id=OLD.id)
         AND c.id=g.card_id AND c.lock_reason='gift:'||g.id::text)
     OR EXISTS(SELECT 1 FROM passport_trades t JOIN passport_trade_items i ON i.trade_id=t.id
       WHERE t.state IN('pending','awaiting_confirmation','cooling_off')
         AND (t.proposer_user_id=OLD.id OR t.recipient_user_id=OLD.id)
         AND i.card_id=c.id AND c.lock_reason='trade:'||t.id::text)
   );
  UPDATE passport_cards SET owner_user_id=NULL,state='revoked',lock_reason=NULL,
    revoked_at=COALESCE(revoked_at,now()),revoked_reason=COALESCE(revoked_reason,'owner_account_deleted'),updated_at=now()
   WHERE owner_user_id=OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS fan_users_release_passport_locks ON fan_users;
CREATE TRIGGER fan_users_release_passport_locks
BEFORE DELETE ON fan_users
FOR EACH ROW EXECUTE FUNCTION release_passport_locks_before_fan_delete();

UPDATE passport_cards c SET state='active',lock_reason=NULL,updated_at=now()
WHERE c.state='locked' AND c.lock_reason LIKE 'gift:%'
  AND NOT EXISTS(SELECT 1 FROM passport_gifts g
    WHERE g.card_id=c.id AND g.state='pending' AND c.lock_reason='gift:'||g.id::text);
UPDATE passport_cards c SET state='active',lock_reason=NULL,updated_at=now()
WHERE c.state='locked' AND c.lock_reason LIKE 'trade:%'
  AND NOT EXISTS(SELECT 1 FROM passport_trade_items i JOIN passport_trades t ON t.id=i.trade_id
    WHERE i.card_id=c.id AND t.state IN('pending','awaiting_confirmation','cooling_off')
      AND c.lock_reason='trade:'||t.id::text);

CREATE TABLE IF NOT EXISTS passport_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('achievement','card','presence','gift','trade','moderation','other')),
  subject_id text NOT NULL,
  reason text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','under_review','approved','denied','closed')),
  response text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS passport_appeals_open_subject_uniq
  ON passport_appeals (user_id, subject_type, subject_id)
  WHERE state IN ('open','under_review');

CREATE TABLE IF NOT EXISTS passport_moderator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES admin_users(id),
  network_slug text NOT NULL DEFAULT 'core',
  channel_slug text,
  event_id uuid REFERENCES passport_events(id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_moderator_assignments_staff_idx
  ON passport_moderator_assignments (staff_user_id, channel_slug, event_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS passport_moderator_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES passport_moderator_assignments(id),
  started_by text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS passport_moderator_shifts_active_uniq
  ON passport_moderator_shifts (assignment_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS passport_channel_controls (
  channel_slug text NOT NULL,
  scope_key text NOT NULL DEFAULT '*',
  event_id uuid REFERENCES passport_events(id) ON DELETE CASCADE,
  polls_frozen boolean NOT NULL DEFAULT false,
  scores_frozen boolean NOT NULL DEFAULT false,
  rewards_frozen boolean NOT NULL DEFAULT false,
  moments_frozen boolean NOT NULL DEFAULT false,
  chat_frozen boolean NOT NULL DEFAULT false,
  common_budget integer NOT NULL DEFAULT 10000 CHECK (common_budget >= 0),
  rare_budget integer NOT NULL DEFAULT 250 CHECK (rare_budget >= 0),
  legendary_budget integer NOT NULL DEFAULT 10 CHECK (legendary_budget >= 0),
  common_used integer NOT NULL DEFAULT 0 CHECK (common_used >= 0),
  rare_used integer NOT NULL DEFAULT 0 CHECK (rare_used >= 0),
  legendary_used integer NOT NULL DEFAULT 0 CHECK (legendary_used >= 0),
  reason text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_slug, scope_key),
  CONSTRAINT passport_channel_controls_scope_check CHECK (scope_key=COALESCE(event_id::text,'*'))
);

ALTER TABLE passport_channel_controls ADD COLUMN IF NOT EXISTS scope_key text NOT NULL DEFAULT '*';
UPDATE passport_channel_controls SET scope_key=COALESCE(event_id::text,'*')
WHERE scope_key IS DISTINCT FROM COALESCE(event_id::text,'*');
ALTER TABLE passport_channel_controls DROP CONSTRAINT IF EXISTS passport_channel_controls_pkey;
ALTER TABLE passport_channel_controls ADD CONSTRAINT passport_channel_controls_pkey PRIMARY KEY(channel_slug,scope_key);
INSERT INTO passport_channel_controls
  (channel_slug,scope_key,event_id,common_budget,rare_budget,legendary_budget,common_used,rare_used,legendary_used,reason,updated_by,updated_at)
SELECT channel_slug,'*',NULL,common_budget,rare_budget,legendary_budget,common_used,rare_used,legendary_used,
       'Migrated channel budget from legacy event-scoped controls',updated_by,updated_at
  FROM passport_channel_controls WHERE scope_key<>'*'
ON CONFLICT(channel_slug,scope_key) DO UPDATE SET
  common_budget=GREATEST(passport_channel_controls.common_budget,EXCLUDED.common_budget),
  rare_budget=GREATEST(passport_channel_controls.rare_budget,EXCLUDED.rare_budget),
  legendary_budget=GREATEST(passport_channel_controls.legendary_budget,EXCLUDED.legendary_budget),
  common_used=GREATEST(passport_channel_controls.common_used,EXCLUDED.common_used),
  rare_used=GREATEST(passport_channel_controls.rare_used,EXCLUDED.rare_used),
  legendary_used=GREATEST(passport_channel_controls.legendary_used,EXCLUDED.legendary_used);
ALTER TABLE passport_channel_controls DROP CONSTRAINT IF EXISTS passport_channel_controls_event_id_fkey;
ALTER TABLE passport_channel_controls ADD CONSTRAINT passport_channel_controls_event_id_fkey
  FOREIGN KEY(event_id) REFERENCES passport_events(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='passport_channel_controls'::regclass AND conname='passport_channel_controls_scope_check') THEN
    ALTER TABLE passport_channel_controls ADD CONSTRAINT passport_channel_controls_scope_check
      CHECK(scope_key=COALESCE(event_id::text,'*'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS passport_channel_controls_event_idx ON passport_channel_controls(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS passport_event_scores (
  event_id uuid PRIMARY KEY REFERENCES passport_events(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{"teams":[],"clock":null,"period":null}'::jsonb,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'unofficial' CHECK (status IN ('unofficial','pending_verification','certified','disputed','frozen')),
  updated_by text,
  certified_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  certified_at timestamptz
);

CREATE TABLE IF NOT EXISTS passport_score_revisions (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES passport_events(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  previous_state jsonb NOT NULL,
  next_state jsonb NOT NULL,
  reason text NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, revision)
);

CREATE TABLE IF NOT EXISTS passport_reward_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES passport_events(id) ON DELETE SET NULL,
  channel_slug text NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('achievement','card','cosmetic','xp','sparks')),
  reward_code text,
  reward_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_ids text[] NOT NULL,
  reason text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','denied','cancelled','revoked')),
  nominated_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passport_ledger (
  id bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  asset_type text NOT NULL,
  asset_id text,
  delta integer,
  channel_slug text,
  source_type text NOT NULL,
  source_id text,
  actor_type text NOT NULL CHECK (actor_type IN ('system','fan','staff')),
  actor_id text,
  reversal_of bigint REFERENCES passport_ledger(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_ledger_user_idx
  ON passport_ledger (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS passport_ledger_source_idx
  ON passport_ledger (source_type, source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS passport_activity_outbox (
  id bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  metric text NOT NULL,
  amount integer NOT NULL DEFAULT 1 CHECK(amount>0),
  channel_slug text,
  source_type text NOT NULL,
  source_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_activity_outbox_pending_idx
  ON passport_activity_outbox(available_at,id) WHERE state='pending';

CREATE OR REPLACE FUNCTION prevent_passport_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- ON DELETE SET NULL must be able to anonymize a closed fan account while
  -- preserving the economic/audit event. No other column may change.
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT NULL
     AND NEW.user_id IS NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'passport_ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS passport_ledger_no_update ON passport_ledger;
CREATE TRIGGER passport_ledger_no_update
BEFORE UPDATE OR DELETE ON passport_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_passport_ledger_mutation();

CREATE TABLE IF NOT EXISTS passport_admin_audit (
  id bigserial PRIMARY KEY,
  actor_id text NOT NULL,
  actor_email text,
  action text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  reason text,
  previous jsonb,
  next jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_admin_audit_scope_idx
  ON passport_admin_audit (scope_type, scope_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_passport_admin_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'passport_admin_audit is append-only';
END;
$$;
DROP TRIGGER IF EXISTS passport_admin_audit_no_update ON passport_admin_audit;
CREATE TRIGGER passport_admin_audit_no_update
BEFORE UPDATE OR DELETE ON passport_admin_audit
FOR EACH ROW EXECUTE FUNCTION prevent_passport_admin_audit_mutation();

CREATE TABLE IF NOT EXISTS passport_rate_limits (
  subject_key text NOT NULL,
  action text NOT NULL,
  bucket_started_at timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1 CHECK (hits > 0),
  PRIMARY KEY (subject_key, action, bucket_started_at)
);

ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS passport_event_id uuid REFERENCES passport_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_slug text,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS passport_audience text NOT NULL DEFAULT 'signed_in' CHECK (passport_audience IN ('everyone','signed_in','live_attendees','members')),
  ADD COLUMN IF NOT EXISTS certified_by text,
  ADD COLUMN IF NOT EXISTS certified_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='polls' AND column_name='description'
  ) THEN
    EXECUTE $repair$
      UPDATE polls SET passport_audience=lower(substring(description FROM 'Audience: (everyone|signed_in|live_attendees|members)'))
      WHERE description ~* 'Audience: (everyone|signed_in|live_attendees|members)'
    $repair$;
  END IF;
END $$;

UPDATE polls SET passport_audience='signed_in'
WHERE passport_audience NOT IN ('everyone','signed_in','live_attendees','members');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='polls'::regclass AND conname='polls_passport_audience_check'
  ) THEN
    ALTER TABLE polls ADD CONSTRAINT polls_passport_audience_check
      CHECK (passport_audience IN ('everyone','signed_in','live_attendees','members'));
  END IF;
END $$;

INSERT INTO passport_achievement_definitions
  (code, family, name, description, tier, icon, threshold, metric, reward, secret, sort_order)
VALUES
  ('first-live', 'attendance', 'First Live', 'Attended your first verified CORE live event.', 'bronze', 'radio', 1, 'events_attended', '{"globalXp":100,"cosmetic":"title-first-live"}', false, 10),
  ('live-regular', 'attendance', 'Live Regular', 'Attended ten verified live events.', 'silver', 'calendar-check', 10, 'events_attended', '{"globalXp":250}', false, 20),
  ('core-historian', 'collection', 'CORE Historian', 'Collected twenty official Moment Cards.', 'gold', 'library', 20, 'cards_collected', '{"globalXp":500,"cosmetic":"title-core-historian"}', false, 30),
  ('passport-explorer', 'community', 'Passport Explorer', 'Earned Channel XP in three CORE communities.', 'silver', 'compass', 3, 'channels_visited', '{"globalXp":200,"cosmetic":"frame-passport"}', false, 40),
  ('called-it', 'knowledge', 'Called It', 'Made a certified correct live prediction.', 'bronze', 'sparkles', 1, 'correct_prediction', '{"globalXp":75}', false, 50),
  ('opening-night', 'legacy', 'Opening Night', 'Witnessed an official opening-night broadcast live.', 'icon', 'ticket', 1, 'opening_night', '{"globalXp":500,"cosmetic":"title-opening-night"}', true, 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO passport_cosmetics (code, kind, name, description, asset, rarity)
VALUES
  ('title-core-rookie', 'title', 'CORE Rookie', 'The starting title for every CORE Passport.', '{"label":"CORE Rookie"}', 'common'),
  ('title-first-live', 'title', 'First Live', 'A title for fans who joined their first verified live.', '{"label":"First Live"}', 'common'),
  ('title-core-historian', 'title', 'CORE Historian', 'A title for collectors preserving CORE history.', '{"label":"CORE Historian"}', 'historic'),
  ('title-opening-night', 'title', 'Opening Night', 'A legacy title for fans who were there at the beginning.', '{"label":"Opening Night"}', 'legendary'),
  ('title-watch-together', 'title', 'Watch Together', 'A community title earned by completing a CORE watch goal together.', '{"label":"Watch Together"}', 'rare'),
  ('frame-passport', 'frame', 'Passport Explorer', 'A network-wide frame earned by exploring CORE communities.', '{"accent":"#e31b36","style":"passport"}', 'rare'),
  ('nameplate-core-red', 'nameplate', 'CORE Red', 'The classic CORE chat nameplate.', '{"accent":"#e31b36"}', 'common')
ON CONFLICT (code) DO NOTHING;

UPDATE passport_achievement_definitions SET metric='correct_prediction',updated_at=now()
WHERE code='called-it' AND metric<>'correct_prediction';

INSERT INTO passport_quest_definitions
  (code, campaign_code, name, description, objective, reward, repeatable)
VALUES
  ('welcome-passport', 'passport-orientation', 'Start Your Passport', 'Visit a channel, finish a video, and equip a title.', '{"steps":["visit_channel","video_complete","equip_title"],"required":3}', '{"globalXp":150,"sparks":25}', false),
  ('live-week', 'weekly-live', 'Live Week', 'Attend two verified live broadcasts this week.', '{"metric":"events_attended","required":2,"window":"week"}', '{"globalXp":200,"sparks":40}', true)
ON CONFLICT (code) DO UPDATE SET
  objective=EXCLUDED.objective,
  repeatable=EXCLUDED.repeatable,
  updated_at=now();

INSERT INTO passport_community_goals
  (code, name, description, metric, target, reward)
VALUES
  ('core-watch-together', 'Watch Together', 'The whole CORE community builds this total by watching CORE videos.', 'watch_seconds', 100000, '{"globalXp":100,"cosmetic":"title-watch-together"}')
ON CONFLICT (code) DO UPDATE SET reward=EXCLUDED.reward,updated_at=now();

INSERT INTO passport_community_goal_progress (goal_code)
VALUES ('core-watch-together')
ON CONFLICT (goal_code) DO NOTHING;

INSERT INTO passport_crafting_recipes
  (code, name, description, input_count, input_rarity, output_type, output_code, output_amount)
VALUES
  ('three-common-to-sparks', 'Memory Echoes', 'Retire three eligible common duplicate cards for Sparks.', 3, 'common', 'sparks', NULL, 30),
  ('five-common-core-red', 'CORE Red Nameplate', 'Retire five eligible common duplicates for the CORE Red nameplate.', 5, 'common', 'cosmetic', 'nameplate-core-red', 1)
ON CONFLICT (code) DO UPDATE SET
  input_rarity=EXCLUDED.input_rarity;
