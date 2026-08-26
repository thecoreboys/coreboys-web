import type { Playable } from "@/lib/watch/playable";
import {
  normalizeSharedPlayable,
  normalizeWorkspace,
  type NormalizedWorkspaceSnapshot,
} from "@/lib/watch/workspace";

export const WATCH_ROOM_STATE_VERSION = 1 as const;
export const WATCH_ROOM_MAX_QUEUE = 30;
export const WATCH_ROOM_MAX_MEMBERS = 12;

export type WatchRoomPlayback = {
  itemKey: string | null;
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
  observedAt: string;
};

export type WatchRoomState = {
  schemaVersion: typeof WATCH_ROOM_STATE_VERSION;
  current: Playable | null;
  queue: Playable[];
  workspace: NormalizedWorkspaceSnapshot | null;
  playback: WatchRoomPlayback;
};

export type WatchRoomMember = {
  peerId: string;
  displayName: string;
  role: "host" | "guest";
  lastSeenAt: string;
};

export type WatchRoomSignalKind = "offer" | "answer" | "ice" | "bye";

export type WatchRoomSignal = {
  id: number;
  senderPeerId: string;
  targetPeerId: string | null;
  kind: WatchRoomSignalKind;
  payload: unknown;
  createdAt: string;
};

export type WatchRoomSnapshot = {
  id: string;
  title: string;
  role: "host" | "guest";
  hostPeerId: string | null;
  version: number;
  state: WatchRoomState;
  members: WatchRoomMember[];
  signals: WatchRoomSignal[];
  expiresAt: string;
};

export type WatchRoomRealtimeMessage =
  | { type: "state"; version: number; state: WatchRoomState }
  | { type: "queue-proposal"; queue: Playable[] }
  | { type: "request-state" }
  | { type: "ping"; sentAt: number };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedSeconds(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(14 * 24 * 60 * 60, Math.max(0, number)) : 0;
}

export function normalizeWatchRoomState(
  value: unknown,
  observedAt = new Date().toISOString(),
): WatchRoomState {
  const raw = record(value) ?? {};
  const current = normalizeSharedPlayable(raw.current);
  const seen = new Set<string>(current ? [current.key] : []);
  const queue = (Array.isArray(raw.queue) ? raw.queue : [])
    // Inspect a small bounded surplus so duplicates/current entries do not
    // reduce a valid 30-item queue after sanitization.
    .slice(0, WATCH_ROOM_MAX_QUEUE * 4)
    .flatMap((candidate) => {
      const item = normalizeSharedPlayable(candidate);
      if (!item || seen.has(item.key)) return [];
      seen.add(item.key);
      return [item];
    })
    .slice(0, WATCH_ROOM_MAX_QUEUE);
  const workspace = normalizeWorkspace(raw.workspace);
  const playbackRaw = record(raw.playback) ?? {};
  const itemKey = current?.key ?? null;
  const requestedObservedAt = typeof playbackRaw.observedAt === "string"
    && Number.isFinite(Date.parse(playbackRaw.observedAt))
      ? playbackRaw.observedAt
      : observedAt;

  return {
    schemaVersion: WATCH_ROOM_STATE_VERSION,
    current,
    queue,
    workspace,
    playback: {
      itemKey,
      playing: playbackRaw.playing === true,
      positionSeconds: boundedSeconds(playbackRaw.positionSeconds),
      durationSeconds: boundedSeconds(playbackRaw.durationSeconds),
      observedAt: requestedObservedAt,
    },
  };
}

export function parseWatchRoomRealtimeMessage(value: unknown): WatchRoomRealtimeMessage | null {
  const raw = record(value);
  if (!raw || typeof raw.type !== "string") return null;
  if (raw.type === "state") {
    const version = Number(raw.version);
    if (!Number.isSafeInteger(version) || version < 0) return null;
    return { type: "state", version, state: normalizeWatchRoomState(raw.state) };
  }
  if (raw.type === "queue-proposal") {
    return { type: "queue-proposal", queue: normalizeWatchRoomState({ queue: raw.queue }).queue };
  }
  if (raw.type === "request-state") return { type: "request-state" };
  if (raw.type === "ping") {
    const sentAt = Number(raw.sentAt);
    return Number.isFinite(sentAt) ? { type: "ping", sentAt } : null;
  }
  return null;
}
