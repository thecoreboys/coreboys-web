"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

export type WatchMark = {
  ref: string;
  kind?: string;
  subject?: string | null;
  progress: number;
  completed: boolean;
  completionSource?: "playback" | "manual" | "provider" | null;
  hoverCount: number;
  seconds: number;
  positionSeconds: number;
  durationSeconds: number;
  positionUpdatedAt?: string | null;
  updatedAt?: string;
};

export type WatchProgressMap = Record<string, WatchMark>;
type Store = WatchProgressMap;
type Snap = { map: Store; ready: boolean };
type Bucket = {
  cache: Store;
  loaded: boolean;
  ready: boolean;
  version: number;
  snap: Snap;
  listeners: Set<() => void>;
  loading?: Promise<void>;
  focusHandler?: () => void;
  storageHandler?: (event: StorageEvent) => void;
  guestSourceId?: string;
  guestRevision: number;
  guestPersisted: boolean;
};

type GuestState = {
  version: 2;
  sourceId: string;
  revision: number;
  items: Store;
};

const GUEST_KEY = "core-watch-progress:guest:v1";
const MAX_GUEST_MARKS = 300;
const EMPTY_SNAP: Snap = { map: {}, ready: false };
const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
  const known = buckets.get(key);
  if (known) return known;
  const bucket: Bucket = {
    cache: {},
    loaded: false,
    ready: false,
    version: 0,
    snap: EMPTY_SNAP,
    listeners: new Set(),
    guestRevision: 0,
    guestPersisted: false,
  };
  buckets.set(key, bucket);
  return bucket;
}

function emit(bucket: Bucket) {
  bucket.snap = { map: bucket.cache, ready: bucket.ready };
  for (const listener of bucket.listeners) listener();
}

function createGuestSourceId() {
  try {
    return `guest-${crypto.randomUUID()}`;
  } catch {
    return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function validTime(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function normalizeStoredMark(ref: string, value: unknown): WatchMark | null {
  if (!value || typeof value !== "object") return null;
  const mark = value as Partial<WatchMark>;
  const storedRef = typeof mark.ref === "string" && mark.ref ? mark.ref : ref;
  if (!storedRef) return null;
  return {
    ref: storedRef,
    kind: typeof mark.kind === "string" ? mark.kind : undefined,
    subject: typeof mark.subject === "string" || mark.subject === null ? mark.subject : undefined,
    progress: Math.min(1, Math.max(0, Number(mark.progress) || 0)),
    completed: Boolean(mark.completed),
    completionSource:
      mark.completionSource === "playback" || mark.completionSource === "manual" || mark.completionSource === "provider"
        ? mark.completionSource
        : null,
    hoverCount: Math.max(0, Math.trunc(Number(mark.hoverCount) || 0)),
    seconds: Math.max(0, Math.trunc(Number(mark.seconds) || 0)),
    positionSeconds: Math.max(0, Number(mark.positionSeconds) || 0),
    durationSeconds: Math.max(0, Number(mark.durationSeconds) || 0),
    positionUpdatedAt:
      typeof mark.positionUpdatedAt === "string" || mark.positionUpdatedAt === null
        ? mark.positionUpdatedAt
        : undefined,
    updatedAt: typeof mark.updatedAt === "string" ? mark.updatedAt : undefined,
  };
}

function normalizeStore(value: unknown): Store {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Store = {};
  for (const [ref, raw] of Object.entries(value as Record<string, unknown>)) {
    const mark = normalizeStoredMark(ref, raw);
    if (mark) output[mark.ref] = mark;
  }
  return output;
}

function mergeMarks(left: WatchMark, right: WatchMark): WatchMark {
  const leftPositionAt = validTime(left.positionUpdatedAt);
  const rightPositionAt = validTime(right.positionUpdatedAt);
  const positionWinner =
    rightPositionAt === -Infinity && leftPositionAt === -Infinity
      ? right.positionSeconds > left.positionSeconds
        ? right
        : left
      : rightPositionAt >= leftPositionAt
        ? right
        : left;
  const activityWinner = validTime(right.updatedAt) >= validTime(left.updatedAt) ? right : left;
  return {
    ...activityWinner,
    ref: left.ref,
    hoverCount: Math.max(left.hoverCount, right.hoverCount),
    seconds: Math.max(left.seconds, right.seconds),
    progress: Math.max(left.progress, right.progress),
    completed: left.completed || right.completed,
    completionSource:
      left.completionSource === "playback" || right.completionSource === "playback"
        ? "playback"
        : right.completionSource ?? left.completionSource ?? null,
    positionSeconds: positionWinner.positionSeconds,
    durationSeconds: Math.max(left.durationSeconds, right.durationSeconds),
    positionUpdatedAt: positionWinner.positionUpdatedAt,
    updatedAt:
      validTime(right.updatedAt) >= validTime(left.updatedAt)
        ? right.updatedAt ?? left.updatedAt
        : left.updatedAt ?? right.updatedAt,
  };
}

function mergeStores(left: Store, right: Store): Store {
  const output = { ...left };
  for (const [ref, mark] of Object.entries(right)) {
    output[ref] = output[ref] ? mergeMarks(output[ref]!, mark) : mark;
  }
  return output;
}

function readGuestState(): { available: boolean; state: GuestState | null } {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return { available: true, state: null };
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as Partial<GuestState>).version === 2 &&
      typeof (parsed as Partial<GuestState>).sourceId === "string"
    ) {
      const state = parsed as Partial<GuestState>;
      return {
        available: true,
        state: {
          version: 2,
          sourceId: state.sourceId || createGuestSourceId(),
          revision: Math.max(0, Math.trunc(Number(state.revision) || 0)),
          items: normalizeStore(state.items),
        },
      };
    }
    // Upgrade the original v1 shape (a bare ref -> mark object) lazily.
    return {
      available: true,
      state: {
        version: 2,
        sourceId: createGuestSourceId(),
        revision: 0,
        items: normalizeStore(parsed),
      },
    };
  } catch {
    return { available: false, state: null };
  }
}

function writeGuestState(state: GuestState): boolean {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function setGuestBucket(bucket: Bucket, state: GuestState | null, persisted: boolean) {
  bucket.cache = state?.items ?? {};
  bucket.guestSourceId = state?.sourceId;
  bucket.guestRevision = state?.revision ?? 0;
  bucket.guestPersisted = persisted && Boolean(state);
  bucket.version += 1;
}

function synchronizeGuest(bucket: Bucket) {
  const { available, state } = readGuestState();
  if (!available) return;
  if (!state) {
    if (bucket.guestPersisted) {
      bucket.cache = {};
      bucket.guestSourceId = undefined;
      bucket.guestRevision = 0;
      bucket.guestPersisted = false;
    }
    return;
  }
  if (!bucket.guestSourceId || bucket.guestSourceId !== state.sourceId) {
    bucket.cache = state.items;
    bucket.guestSourceId = state.sourceId;
    bucket.guestRevision = state.revision;
    bucket.guestPersisted = true;
    return;
  }
  bucket.cache = mergeStores(state.items, bucket.cache);
  bucket.guestRevision = Math.max(bucket.guestRevision, state.revision);
  bucket.guestPersisted = true;
}

function persistGuest(bucket: Bucket) {
  const stored = readGuestState().state;
  if (stored) {
    bucket.cache = mergeStores(stored.items, bucket.cache);
    if (!bucket.guestSourceId || bucket.guestSourceId !== stored.sourceId) {
      bucket.guestSourceId = stored.sourceId;
    }
    bucket.guestRevision = Math.max(bucket.guestRevision, stored.revision);
  }
  const recent = Object.values(bucket.cache)
    .sort((a, b) => validTime(b.updatedAt) - validTime(a.updatedAt))
    .slice(0, MAX_GUEST_MARKS);
  bucket.cache = Object.fromEntries(recent.map((item) => [item.ref, item]));
  const state: GuestState = {
    version: 2,
    sourceId: bucket.guestSourceId ?? createGuestSourceId(),
    revision: bucket.guestRevision + 1,
    items: bucket.cache,
  };
  bucket.guestSourceId = state.sourceId;
  bucket.guestRevision = state.revision;
  bucket.guestPersisted = writeGuestState(state);
}

function guestSnapshotForMerge(): GuestState | null {
  const stored = readGuestState();
  if (stored.state && Object.keys(stored.state.items).length) {
    // Persist a stable source id while upgrading legacy v1 data so retries are
    // idempotent even if the response is lost after the server commits.
    if (stored.state.revision === 0) writeGuestState(stored.state);
    return stored.state;
  }
  const guestBucket = buckets.get("__guest__");
  if (!guestBucket || !Object.keys(guestBucket.cache).length) return null;
  const sourceId = guestBucket.guestSourceId ?? createGuestSourceId();
  guestBucket.guestSourceId = sourceId;
  return {
    version: 2,
    sourceId,
    revision: guestBucket.guestRevision,
    items: guestBucket.cache,
  };
}

function reconcileMergedGuest(snapshot: GuestState) {
  const current = readGuestState();
  let remaining = current.state;
  if (
    current.state?.sourceId === snapshot.sourceId &&
    current.state.revision === snapshot.revision
  ) {
    try {
      localStorage.removeItem(GUEST_KEY);
      remaining = null;
    } catch {
      // The source ledger keeps a retry idempotent if storage cannot clear.
    }
  } else if (!current.state) {
    remaining = null;
  }
  const guestBucket = buckets.get("__guest__");
  if (guestBucket) {
    setGuestBucket(guestBucket, remaining, Boolean(remaining));
    guestBucket.loaded = true;
    guestBucket.ready = true;
    emit(guestBucket);
  }
}

async function load(key: string, bucket: Bucket, force = false): Promise<void> {
  if (key === "__loading__") return;
  if (bucket.loading) return bucket.loading;
  if (key === "__guest__") {
    if (bucket.loaded && !force) return;
    const stored = readGuestState();
    if (stored.available) setGuestBucket(bucket, stored.state, Boolean(stored.state));
    bucket.loaded = true;
    bucket.ready = true;
    emit(bucket);
    return;
  }
  const guestState = guestSnapshotForMerge();
  if (bucket.loaded && !force && !guestState) return;
  const wasLoaded = bucket.loaded;
  const wasReady = bucket.ready;
  const task = (async () => {
    const startVersion = bucket.version;
    try {
      const method: "GET" | "PUT" = guestState ? "PUT" : "GET";
      const guestItems = guestState
        ? Object.values(guestState.items)
            .sort((a, b) => validTime(b.updatedAt) - validTime(a.updatedAt))
            .slice(0, MAX_GUEST_MARKS)
        : [];
      const response = await fetch("/api/account/progress", {
        method,
        credentials: "same-origin",
        headers: method === "PUT" ? { "content-type": "application/json" } : undefined,
        body:
          method === "PUT"
            ? JSON.stringify({ sourceId: guestState!.sourceId, items: guestItems })
            : undefined,
      });
      if (!response.ok) throw new Error(`progress_${response.status}`);
      const data = (await response.json()) as { items?: WatchMark[] };
      if (method === "PUT" && guestState) reconcileMergedGuest(guestState);
      const next: Store = {};
      for (const item of data.items ?? []) next[item.ref] = item;
      bucket.cache =
        bucket.version === startVersion
          ? next
          : { ...next, ...bucket.cache };
      bucket.loaded = true;
      bucket.ready = true;
    } catch {
      bucket.loaded = wasLoaded;
      bucket.ready = wasReady;
    } finally {
      emit(bucket);
    }
  })();
  bucket.loading = task;
  try {
    await task;
  } finally {
    if (bucket.loading === task) bucket.loading = undefined;
  }
}

function defaultMark(ref: string): WatchMark {
  return {
    ref,
    progress: 0,
    completed: false,
    hoverCount: 0,
    seconds: 0,
    positionSeconds: 0,
    durationSeconds: 0,
  };
}

export function useWatchProgress() {
  const { user, loading } = useAuth();
  const accountKey = loading ? "__loading__" : user?.id ?? "__guest__";
  const bucket = getBucket(accountKey);
  const subscribe = useCallback(
    (listener: () => void) => {
      const wasEmpty = bucket.listeners.size === 0;
      bucket.listeners.add(listener);
      if (wasEmpty && accountKey !== "__loading__" && accountKey !== "__guest__") {
        bucket.focusHandler = () => {
          void load(accountKey, bucket, true);
        };
        window.addEventListener("focus", bucket.focusHandler);
      }
      if (wasEmpty && accountKey === "__guest__") {
        bucket.storageHandler = (event) => {
          if (event.key !== GUEST_KEY && event.key !== null) return;
          void load(accountKey, bucket, true);
        };
        window.addEventListener("storage", bucket.storageHandler);
      }
      void load(accountKey, bucket);
      return () => {
        bucket.listeners.delete(listener);
        if (bucket.listeners.size === 0 && bucket.focusHandler) {
          window.removeEventListener("focus", bucket.focusHandler);
          bucket.focusHandler = undefined;
        }
        if (bucket.listeners.size === 0 && bucket.storageHandler) {
          window.removeEventListener("storage", bucket.storageHandler);
          bucket.storageHandler = undefined;
        }
      };
    },
    [accountKey, bucket],
  );
  const getSnapshot = useCallback(() => bucket.snap, [bucket]);
  const { map, ready } = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAP);

  const mark = useCallback(
    (ref: string, patch: Partial<WatchMark>) => {
      const previous = bucket.cache[ref] ?? defaultMark(ref);
      bucket.cache = {
        ...bucket.cache,
        [ref]: {
          ...previous,
          ...patch,
          ref,
          updatedAt: new Date().toISOString(),
        },
      };
      bucket.version += 1;
      if (accountKey === "__guest__") persistGuest(bucket);
      emit(bucket);
    },
    [accountKey, bucket],
  );

  const send = useCallback(
    (body: Record<string, unknown>, keepalive = false) => {
      if (!user) return;
      void fetch("/api/account/progress", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive,
      }).catch(() => {});
    },
    [user],
  );

  const trackHover = useCallback(
    (ref: string, kind = "youtube", subject?: string | null) => {
      if (!ref) return;
      if (accountKey === "__guest__") synchronizeGuest(bucket);
      const previous = bucket.cache[ref] ?? defaultMark(ref);
      mark(ref, {
        kind,
        subject,
        hoverCount: previous.hoverCount + 1,
      });
      send({ ref, kind, subject: subject ?? null, event: "hover" });
    },
    [accountKey, bucket, mark, send],
  );

  const trackTick = useCallback(
    (
      ref: string,
      kind = "youtube",
      subject?: string | null,
      seconds = 15,
      progress?: number,
      positionSeconds?: number,
      durationSeconds?: number,
      platform?: string,
    ) => {
      if (!ref) return;
      if (accountKey === "__guest__") synchronizeGuest(bucket);
      const previous = bucket.cache[ref] ?? defaultMark(ref);
      const observedAt = new Date().toISOString();
      const measured =
        progress ??
        (positionSeconds != null && durationSeconds
          ? Math.min(1, positionSeconds / durationSeconds)
          : previous.progress);
      const nextProgress = Math.max(previous.progress, measured);
      const completed = nextProgress >= 0.9 || previous.completed;
      mark(ref, {
        kind,
        subject,
        seconds: previous.seconds + Math.max(0, seconds),
        progress: nextProgress,
        positionSeconds: Math.max(0, positionSeconds ?? previous.positionSeconds),
        durationSeconds: Math.max(0, durationSeconds ?? previous.durationSeconds),
        positionUpdatedAt: positionSeconds == null ? previous.positionUpdatedAt : observedAt,
        completed,
        completionSource: nextProgress >= 0.9 ? "playback" : previous.completionSource,
      });
      send({
        ref,
        kind,
        subject: subject ?? null,
        event: "tick",
        seconds,
        progress: nextProgress,
        positionSeconds,
        durationSeconds,
        platform,
        observedAt,
      });
    },
    [accountKey, bucket, mark, send],
  );

  const checkpoint = useCallback(
    (
      ref: string,
      kind = "youtube",
      subject?: string | null,
      progress?: number,
      positionSeconds?: number,
      durationSeconds?: number,
      platform?: string,
    ) => {
      if (!ref) return;
      if (accountKey === "__guest__") synchronizeGuest(bucket);
      const previous = bucket.cache[ref] ?? defaultMark(ref);
      const observedAt = new Date().toISOString();
      const position =
        positionSeconds != null && Number.isFinite(positionSeconds)
          ? Math.max(0, positionSeconds)
          : previous.positionSeconds;
      const duration =
        durationSeconds != null && Number.isFinite(durationSeconds)
          ? Math.max(0, durationSeconds)
          : previous.durationSeconds;
      const measured =
        progress ?? (duration > 0 ? Math.min(1, position / duration) : previous.progress);
      const nextProgress = Math.max(previous.progress, measured);
      mark(ref, {
        kind,
        subject,
        progress: nextProgress,
        positionSeconds: position,
        durationSeconds: Math.max(previous.durationSeconds, duration),
        positionUpdatedAt: observedAt,
        completed: previous.completed || nextProgress >= 0.9,
        completionSource: nextProgress >= 0.9 ? "playback" : previous.completionSource,
      });
      send(
        {
          ref,
          kind,
          subject: subject ?? null,
          event: "tick",
          seconds: 0,
          progress: nextProgress,
          positionSeconds: position,
          durationSeconds: duration,
          platform,
          observedAt,
        },
        true,
      );
    },
    [accountKey, bucket, mark, send],
  );

  const markComplete = useCallback(
    (
      ref: string,
      kind = "youtube",
      subject?: string | null,
      positionSeconds?: number,
      durationSeconds?: number,
      platform?: string,
    ) => {
      if (!ref) return;
      if (accountKey === "__guest__") synchronizeGuest(bucket);
      const previous = bucket.cache[ref] ?? defaultMark(ref);
      const observedAt = new Date().toISOString();
      const duration = Math.max(0, durationSeconds ?? previous.durationSeconds);
      mark(ref, {
        kind,
        subject,
        progress: 1,
        positionSeconds: duration || Math.max(0, positionSeconds ?? previous.positionSeconds),
        durationSeconds: duration,
        positionUpdatedAt: observedAt,
        completed: true,
        completionSource: "playback",
      });
      send({
        ref,
        kind,
        subject: subject ?? null,
        event: "complete",
        positionSeconds: Math.max(0, positionSeconds ?? previous.positionSeconds),
        durationSeconds: duration,
        platform,
        observedAt,
      });
    },
    [accountKey, bucket, mark, send],
  );

  /** Complete the UI state without inventing playback seconds or Passport credit. */
  const markWatched = useCallback(
    (ref: string, kind = "youtube", subject?: string | null, durationSeconds?: number) => {
      if (!ref) return;
      if (accountKey === "__guest__") synchronizeGuest(bucket);
      const previous = bucket.cache[ref] ?? defaultMark(ref);
      const observedAt = new Date().toISOString();
      const duration = Math.max(0, durationSeconds ?? previous.durationSeconds);
      mark(ref, {
        kind,
        subject,
        progress: 1,
        positionSeconds: duration || previous.positionSeconds,
        durationSeconds: duration,
        positionUpdatedAt: observedAt,
        completed: true,
        completionSource: "manual",
      });
      send({
        ref,
        kind,
        subject: subject ?? null,
        event: "mark_watched",
        positionSeconds: duration || previous.positionSeconds,
        durationSeconds: duration,
        observedAt,
      });
    },
    [accountKey, bucket, mark, send],
  );

  return {
    map,
    trackHover,
    trackTick,
    checkpoint,
    markComplete,
    markWatched,
    loaded: ready,
    ready,
    accountKey,
  };
}

export function youtubeIdFromHref(href: string): string | null {
  try {
    const url = new URL(href, "https://core.local");
    const host = url.hostname.toLowerCase();
    const directYoutube =
      host === "youtu.be" ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com");

    if (directYoutube) {
      const pathId =
        host === "youtu.be"
          ? url.pathname.split("/").filter(Boolean)[0]
          : /\/(?:shorts|embed)\/([0-9A-Za-z_-]{6,})/i.exec(url.pathname)?.[1];
      const id = pathId ?? url.searchParams.get("v");
      return id && /^[0-9A-Za-z_-]{6,}$/.test(id) ? id : null;
    }

    const kind = url.searchParams.get("kind");
    const source = url.searchParams.get("src");
    if (kind !== "youtube" && source !== "youtube") return null;
    const id = url.searchParams.get("id");
    return id && /^[0-9A-Za-z_-]{6,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
