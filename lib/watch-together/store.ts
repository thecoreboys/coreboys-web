import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import {
  WATCH_ROOM_MAX_MEMBERS,
  normalizeWatchRoomState,
  type WatchRoomSignalKind,
  type WatchRoomSnapshot,
  type WatchRoomState,
} from "@/lib/watch-together/types";

const ROOM_TTL_HOURS = 24;
const PRESENCE_SECONDS = 90;
const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

let schemaReady: Promise<void> | null = null;

type DbLike = Pick<PoolClient, "query">;

type RoomRow = {
  id: string;
  title: string;
  host_user_id: string;
  state: unknown;
  version: string | number;
  expires_at: Date | string;
};

type MemberRow = {
  peer_id: string;
  display_name: string;
  role: "host" | "guest";
  last_seen_at: Date | string;
};

type SignalRow = {
  id: string | number;
  sender_peer_id: string;
  target_peer_id: string | null;
  kind: WatchRoomSignalKind;
  payload: unknown;
  created_at: Date | string;
};

export class WatchRoomStoreError extends Error {
  readonly code: "room_not_found" | "room_full" | "room_forbidden" | "room_conflict";
  readonly status: 403 | 404 | 409;

  constructor(
    code: WatchRoomStoreError["code"],
    status: WatchRoomStoreError["status"],
  ) {
    super(code);
    this.name = "WatchRoomStoreError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

function hashInviteCode(value: string): string {
  return createHash("sha256").update(normalizeInviteCode(value)).digest("hex");
}

function createInviteCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (let index = 0; index < 10; index += 1) {
    code += INVITE_ALPHABET[bytes[index]! % INVITE_ALPHABET.length];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

export async function ensureWatchRoomSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_rooms (
        id uuid PRIMARY KEY,
        invite_hash text NOT NULL UNIQUE,
        host_user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        title text NOT NULL,
        state jsonb NOT NULL DEFAULT '{}'::jsonb,
        version bigint NOT NULL DEFAULT 1,
        expires_at timestamptz NOT NULL,
        closed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_room_members (
        room_id uuid NOT NULL REFERENCES fan_watch_rooms(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        peer_id text NOT NULL,
        role text NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (room_id, peer_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_room_signals (
        id bigserial PRIMARY KEY,
        room_id uuid NOT NULL REFERENCES fan_watch_rooms(id) ON DELETE CASCADE,
        sender_peer_id text NOT NULL,
        target_peer_id text,
        kind text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS fan_watch_room_signals_poll_idx ON fan_watch_room_signals (room_id, id)`);
    await query(`CREATE INDEX IF NOT EXISTS fan_watch_room_members_presence_idx ON fan_watch_room_members (room_id, last_seen_at DESC)`);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function roomSnapshot(
  db: DbLike,
  room: RoomRow,
  viewerPeerId: string,
  afterSignalId = 0,
): Promise<WatchRoomSnapshot> {
  const members = await db.query<MemberRow>(
    `SELECT members.peer_id, users.display_name, members.role, members.last_seen_at
       FROM fan_watch_room_members members
       JOIN fan_users users ON users.id = members.user_id
      WHERE members.room_id = $1
        AND (members.last_seen_at > now() - ($2::int * interval '1 second') OR members.peer_id = $3)
      ORDER BY CASE WHEN members.role = 'host' THEN 0 ELSE 1 END, members.joined_at ASC`,
    [room.id, PRESENCE_SECONDS, viewerPeerId],
  );
  const signals = await db.query<SignalRow>(
    `SELECT id, sender_peer_id, target_peer_id, kind, payload, created_at
       FROM fan_watch_room_signals
      WHERE room_id = $1
        AND id > $2
        AND expires_at > now()
        AND sender_peer_id <> $3
        AND (target_peer_id IS NULL OR target_peer_id = $3)
      ORDER BY id ASC
      LIMIT 100`,
    [room.id, afterSignalId, viewerPeerId],
  );
  const viewer = members.rows.find((member) => member.peer_id === viewerPeerId);
  if (!viewer) throw new WatchRoomStoreError("room_forbidden", 403);
  const state = normalizeWatchRoomState(room.state);
  return {
    id: room.id,
    title: room.title,
    role: viewer.role,
    hostPeerId: members.rows.find((member) => member.role === "host")?.peer_id ?? null,
    version: Number(room.version),
    state,
    members: members.rows.map((member) => ({
      peerId: member.peer_id,
      displayName: member.display_name,
      role: member.role,
      lastSeenAt: iso(member.last_seen_at),
    })),
    signals: signals.rows.map((signal) => ({
      id: Number(signal.id),
      senderPeerId: signal.sender_peer_id,
      targetPeerId: signal.target_peer_id,
      kind: signal.kind,
      payload: signal.payload,
      createdAt: iso(signal.created_at),
    })),
    expiresAt: iso(room.expires_at),
  };
}

async function activeRoomForMember(
  db: DbLike,
  roomId: string,
  userId: string,
  peerId: string,
  lock = false,
): Promise<{ room: RoomRow; role: "host" | "guest" }> {
  const result = await db.query<RoomRow & { role: "host" | "guest" }>(
    `SELECT rooms.id, rooms.title, rooms.host_user_id, rooms.state, rooms.version, rooms.expires_at,
            members.role
       FROM fan_watch_rooms rooms
       JOIN fan_watch_room_members members ON members.room_id = rooms.id
      WHERE rooms.id = $1
        AND members.user_id = $2
        AND members.peer_id = $3
        AND rooms.closed_at IS NULL
        AND rooms.expires_at > now()
      ${lock ? "FOR UPDATE OF rooms" : ""}`,
    [roomId, userId, peerId],
  );
  const row = result.rows[0];
  if (!row) throw new WatchRoomStoreError("room_not_found", 404);
  await db.query(
    `UPDATE fan_watch_room_members SET last_seen_at = now() WHERE room_id = $1 AND peer_id = $2`,
    [roomId, peerId],
  );
  return { room: row, role: row.role };
}

export async function createWatchRoom(input: {
  userId: string;
  peerId: string;
  title: string;
  state: WatchRoomState;
}): Promise<{ inviteCode: string; snapshot: WatchRoomSnapshot }> {
  await ensureWatchRoomSchema();
  const inviteCode = createInviteCode();
  const id = randomUUID();
  const snapshot = await withTransaction(async (client) => {
    const inserted = await client.query<RoomRow>(
      `INSERT INTO fan_watch_rooms (id, invite_hash, host_user_id, title, state, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, now() + ($6::int * interval '1 hour'))
       RETURNING id, title, host_user_id, state, version, expires_at`,
      [id, hashInviteCode(inviteCode), input.userId, input.title, JSON.stringify(input.state), ROOM_TTL_HOURS],
    );
    await client.query(
      `INSERT INTO fan_watch_room_members (room_id, user_id, peer_id, role)
       VALUES ($1::uuid, $2, $3, 'host')`,
      [id, input.userId, input.peerId],
    );
    return roomSnapshot(client, inserted.rows[0]!, input.peerId);
  });
  return { inviteCode, snapshot };
}

export async function joinWatchRoom(input: {
  userId: string;
  peerId: string;
  inviteCode: string;
}): Promise<WatchRoomSnapshot> {
  await ensureWatchRoomSchema();
  return withTransaction(async (client) => {
    const result = await client.query<RoomRow>(
      `SELECT id, title, host_user_id, state, version, expires_at
         FROM fan_watch_rooms
        WHERE invite_hash = $1 AND closed_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashInviteCode(input.inviteCode)],
    );
    const room = result.rows[0];
    if (!room) throw new WatchRoomStoreError("room_not_found", 404);
    const count = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM fan_watch_room_members
        WHERE room_id = $1 AND last_seen_at > now() - ($2::int * interval '1 second')`,
      [room.id, PRESENCE_SECONDS],
    );
    const existing = await client.query<{ user_id: string; role: "host" | "guest" }>(
      `SELECT user_id, role FROM fan_watch_room_members WHERE room_id = $1 AND peer_id = $2`,
      [room.id, input.peerId],
    );
    if (existing.rows[0] && existing.rows[0].user_id !== input.userId) {
      throw new WatchRoomStoreError("room_forbidden", 403);
    }
    if (!existing.rows[0] && Number(count.rows[0]?.count ?? 0) >= WATCH_ROOM_MAX_MEMBERS) {
      throw new WatchRoomStoreError("room_full", 409);
    }
    const role = input.userId === room.host_user_id ? "host" : "guest";
    await client.query(
      `INSERT INTO fan_watch_room_members (room_id, user_id, peer_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, peer_id) DO UPDATE SET
         role = EXCLUDED.role,
         last_seen_at = now()
       WHERE fan_watch_room_members.user_id = EXCLUDED.user_id`,
      [room.id, input.userId, input.peerId, role],
    );
    return roomSnapshot(client, room, input.peerId);
  });
}

export async function getWatchRoom(input: {
  roomId: string;
  userId: string;
  peerId: string;
  afterSignalId?: number;
}): Promise<WatchRoomSnapshot> {
  await ensureWatchRoomSchema();
  return withTransaction(async (client) => {
    const { room } = await activeRoomForMember(client, input.roomId, input.userId, input.peerId);
    await client.query(
      `DELETE FROM fan_watch_room_signals WHERE room_id = $1 AND expires_at <= now()`,
      [input.roomId],
    );
    return roomSnapshot(client, room, input.peerId, input.afterSignalId ?? 0);
  });
}

export async function updateWatchRoomState(input: {
  roomId: string;
  userId: string;
  peerId: string;
  baseVersion: number;
  scope: "host" | "queue";
  state: WatchRoomState;
}): Promise<WatchRoomSnapshot> {
  await ensureWatchRoomSchema();
  return withTransaction(async (client) => {
    const { room, role } = await activeRoomForMember(
      client,
      input.roomId,
      input.userId,
      input.peerId,
      true,
    );
    if (input.scope === "host" && role !== "host") {
      throw new WatchRoomStoreError("room_forbidden", 403);
    }
    if (Number(room.version) !== input.baseVersion) {
      throw new WatchRoomStoreError("room_conflict", 409);
    }
    const current = normalizeWatchRoomState(room.state);
    const next = input.scope === "host"
      ? normalizeWatchRoomState(input.state)
      : normalizeWatchRoomState({ ...current, queue: input.state.queue });
    const updated = await client.query<RoomRow>(
      `UPDATE fan_watch_rooms
          SET state = $2::jsonb, version = version + 1, updated_at = now()
        WHERE id = $1
        RETURNING id, title, host_user_id, state, version, expires_at`,
      [room.id, JSON.stringify(next)],
    );
    return roomSnapshot(client, updated.rows[0]!, input.peerId);
  });
}

export async function postWatchRoomSignal(input: {
  roomId: string;
  userId: string;
  peerId: string;
  targetPeerId: string | null;
  kind: WatchRoomSignalKind;
  payload: unknown;
}): Promise<number> {
  await ensureWatchRoomSchema();
  return withTransaction(async (client) => {
    await activeRoomForMember(client, input.roomId, input.userId, input.peerId);
    if (input.targetPeerId) {
      const target = await client.query(
        `SELECT 1 FROM fan_watch_room_members WHERE room_id = $1 AND peer_id = $2`,
        [input.roomId, input.targetPeerId],
      );
      if (!target.rowCount) throw new WatchRoomStoreError("room_not_found", 404);
    }
    const result = await client.query<{ id: string | number }>(
      `INSERT INTO fan_watch_room_signals
         (room_id, sender_peer_id, target_peer_id, kind, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [input.roomId, input.peerId, input.targetPeerId, input.kind, JSON.stringify(input.payload)],
    );
    return Number(result.rows[0]!.id);
  });
}

export async function leaveWatchRoom(input: {
  roomId: string;
  userId: string;
  peerId: string;
  close: boolean;
}): Promise<void> {
  await ensureWatchRoomSchema();
  await withTransaction(async (client) => {
    const { role } = await activeRoomForMember(client, input.roomId, input.userId, input.peerId, true);
    if (input.close) {
      if (role !== "host") throw new WatchRoomStoreError("room_forbidden", 403);
      await client.query(
        `UPDATE fan_watch_rooms SET closed_at = now(), updated_at = now() WHERE id = $1`,
        [input.roomId],
      );
      return;
    }
    await client.query(
      `DELETE FROM fan_watch_room_members WHERE room_id = $1 AND peer_id = $2 AND user_id = $3`,
      [input.roomId, input.peerId, input.userId],
    );
  });
}
