-- Private watch-together rooms and short-lived WebRTC signaling.
-- Invite codes are stored only as SHA-256 hashes. Playback never traverses
-- this database; media remains on the official provider embeds.

CREATE TABLE IF NOT EXISTS fan_watch_rooms (
  id            uuid PRIMARY KEY,
  invite_hash   text NOT NULL UNIQUE,
  host_user_id  text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  state         jsonb NOT NULL DEFAULT '{}'::jsonb,
  version       bigint NOT NULL DEFAULT 1,
  expires_at    timestamptz NOT NULL,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fan_watch_rooms_title_check CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT fan_watch_rooms_invite_hash_check CHECK (invite_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT fan_watch_rooms_version_check CHECK (version > 0),
  CONSTRAINT fan_watch_rooms_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT fan_watch_rooms_state_check CHECK (jsonb_typeof(state) = 'object')
);

CREATE INDEX IF NOT EXISTS fan_watch_rooms_host_idx
  ON fan_watch_rooms (host_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS fan_watch_rooms_active_idx
  ON fan_watch_rooms (expires_at) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS fan_watch_room_members (
  room_id       uuid NOT NULL REFERENCES fan_watch_rooms(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  peer_id       text NOT NULL,
  role          text NOT NULL,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, peer_id),
  CONSTRAINT fan_watch_room_members_peer_check CHECK (peer_id ~ '^[A-Za-z0-9_-]{16,80}$'),
  CONSTRAINT fan_watch_room_members_role_check CHECK (role IN ('host', 'guest'))
);

CREATE INDEX IF NOT EXISTS fan_watch_room_members_user_idx
  ON fan_watch_room_members (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS fan_watch_room_members_presence_idx
  ON fan_watch_room_members (room_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS fan_watch_room_signals (
  id              bigserial PRIMARY KEY,
  room_id         uuid NOT NULL REFERENCES fan_watch_rooms(id) ON DELETE CASCADE,
  sender_peer_id  text NOT NULL,
  target_peer_id  text,
  kind            text NOT NULL,
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  CONSTRAINT fan_watch_room_signals_sender_check CHECK (sender_peer_id ~ '^[A-Za-z0-9_-]{16,80}$'),
  CONSTRAINT fan_watch_room_signals_target_check CHECK (target_peer_id IS NULL OR target_peer_id ~ '^[A-Za-z0-9_-]{16,80}$'),
  CONSTRAINT fan_watch_room_signals_kind_check CHECK (kind IN ('offer', 'answer', 'ice', 'bye')),
  CONSTRAINT fan_watch_room_signals_payload_check CHECK (jsonb_typeof(payload) IN ('object', 'array', 'string'))
);

CREATE INDEX IF NOT EXISTS fan_watch_room_signals_poll_idx
  ON fan_watch_room_signals (room_id, id);
CREATE INDEX IF NOT EXISTS fan_watch_room_signals_expiry_idx
  ON fan_watch_room_signals (expires_at);
