"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

export type WatchFeedbackValue = "like" | "dislike" | "not_interested";

export type WatchFeedbackEntry = {
  value: WatchFeedbackValue;
  updatedAt: string;
};

export type WatchNamedQueue = {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type WatchDiscoveryState = {
  version: 1;
  feedback: Record<string, WatchFeedbackEntry>;
  feedbackTombstones: Record<string, string>;
  queues: WatchNamedQueue[];
  queueTombstones: Record<string, string>;
  rowOrder: string[];
  rowOrderUpdatedAt: string | null;
};

const STORAGE_KEY = "core-watch-discovery:v1";
const MAX_QUEUES = 20;
const MAX_QUEUE_ITEMS = 120;
const MAX_FEEDBACK = 500;
const MAX_TOMBSTONES = 500;

const EMPTY_STATE: WatchDiscoveryState = {
  version: 1,
  feedback: {},
  feedbackTombstones: {},
  queues: [],
  queueTombstones: {},
  rowOrder: [],
  rowOrderUpdatedAt: null,
};

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function validDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : new Date(0).toISOString();
}

function normalizeTombstones(value: unknown, maxKeyLength: number) {
  const tombstones: Record<string, string> = {};
  if (!value || typeof value !== "object") return tombstones;
  for (const [rawKey, rawTimestamp] of Object.entries(value)) {
    if (typeof rawTimestamp !== "string" || !Number.isFinite(Date.parse(rawTimestamp))) continue;
    const key = rawKey.trim().slice(0, maxKeyLength);
    if (!key) continue;
    tombstones[key] = rawTimestamp;
  }
  return Object.fromEntries(
    Object.entries(tombstones)
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
      .slice(0, MAX_TOMBSTONES),
  );
}

function normalizeQueue(value: unknown): WatchNamedQueue | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<WatchNamedQueue>;
  if (typeof input.id !== "string" || !input.id.trim()) return null;
  const now = new Date().toISOString();
  return {
    id: input.id.trim().slice(0, 80),
    name: (typeof input.name === "string" ? input.name.trim() : "My Queue").slice(0, 50) || "My Queue",
    itemIds: Array.isArray(input.itemIds)
      ? [...new Set(input.itemIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.slice(0, 200)))].slice(0, MAX_QUEUE_ITEMS)
      : [],
    createdAt: validDate(input.createdAt) === new Date(0).toISOString() ? now : validDate(input.createdAt),
    updatedAt: validDate(input.updatedAt) === new Date(0).toISOString() ? now : validDate(input.updatedAt),
  };
}

export function normalizeDiscoveryState(value: unknown): WatchDiscoveryState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const input = value as Partial<WatchDiscoveryState>;
  const feedback: Record<string, WatchFeedbackEntry> = {};
  const feedbackTombstones = normalizeTombstones(input.feedbackTombstones, 240);
  if (input.feedback && typeof input.feedback === "object") {
    for (const [rawKey, rawEntry] of Object.entries(input.feedback).slice(0, MAX_FEEDBACK)) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Partial<WatchFeedbackEntry>;
      if (!(["like", "dislike", "not_interested"] as unknown[]).includes(entry.value)) continue;
      const key = rawKey.trim().slice(0, 240);
      if (!key) continue;
      feedback[key] = { value: entry.value!, updatedAt: validDate(entry.updatedAt) };
    }
  }
  for (const [key, deletedAt] of Object.entries(feedbackTombstones)) {
    const entry = feedback[key];
    if (entry && Date.parse(deletedAt) >= Date.parse(entry.updatedAt)) delete feedback[key];
  }
  const queueTombstones = normalizeTombstones(input.queueTombstones, 80);
  const queues = Array.isArray(input.queues)
    ? input.queues
        .map(normalizeQueue)
        .filter((queue): queue is WatchNamedQueue => Boolean(queue))
        .filter((queue) => Date.parse(queue.updatedAt) > Date.parse(queueTombstones[queue.id] ?? "0"))
        .slice(0, MAX_QUEUES)
    : [];
  return {
    version: 1,
    feedback,
    feedbackTombstones,
    queues,
    queueTombstones,
    rowOrder: Array.isArray(input.rowOrder)
      ? [...new Set(input.rowOrder.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.slice(0, 60)))].slice(0, 30)
      : [],
    rowOrderUpdatedAt:
      typeof input.rowOrderUpdatedAt === "string" && Number.isFinite(Date.parse(input.rowOrderUpdatedAt))
        ? input.rowOrderUpdatedAt
        : null,
  };
}

export function mergeDiscoveryStates(...states: WatchDiscoveryState[]): WatchDiscoveryState {
  const feedback: Record<string, WatchFeedbackEntry> = {};
  const feedbackTombstones: Record<string, string> = {};
  const queueMap = new Map<string, WatchNamedQueue>();
  const queueTombstones: Record<string, string> = {};
  let rowOrder: string[] = [];
  let rowOrderUpdatedAt: string | null = null;
  for (const state of states) {
    for (const [key, entry] of Object.entries(state.feedback)) {
      const known = feedback[key];
      if (!known || Date.parse(entry.updatedAt) >= Date.parse(known.updatedAt)) feedback[key] = entry;
    }
    for (const [key, deletedAt] of Object.entries(state.feedbackTombstones ?? {})) {
      if (!feedbackTombstones[key] || Date.parse(deletedAt) >= Date.parse(feedbackTombstones[key]!)) {
        feedbackTombstones[key] = deletedAt;
      }
    }
    for (const queue of state.queues) {
      const known = queueMap.get(queue.id);
      if (!known || Date.parse(queue.updatedAt) >= Date.parse(known.updatedAt)) queueMap.set(queue.id, queue);
    }
    for (const [id, deletedAt] of Object.entries(state.queueTombstones ?? {})) {
      if (!queueTombstones[id] || Date.parse(deletedAt) >= Date.parse(queueTombstones[id]!)) {
        queueTombstones[id] = deletedAt;
      }
    }
    if (
      state.rowOrder.length &&
      (!rowOrderUpdatedAt || Date.parse(state.rowOrderUpdatedAt ?? "0") >= Date.parse(rowOrderUpdatedAt))
    ) {
      rowOrder = state.rowOrder;
      rowOrderUpdatedAt = state.rowOrderUpdatedAt;
    }
  }
  return normalizeDiscoveryState({
    version: 1,
    feedback,
    feedbackTombstones,
    queues: [...queueMap.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    queueTombstones,
    rowOrder,
    rowOrderUpdatedAt,
  });
}

function readStored(key: string) {
  try {
    return normalizeDiscoveryState(JSON.parse(localStorage.getItem(key) || "{}"));
  } catch {
    return EMPTY_STATE;
  }
}

function writeStored(key: string, state: WatchDiscoveryState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Discovery remains fully usable in-memory when browser storage is unavailable.
  }
}

function queueId() {
  try {
    return `queue-${crypto.randomUUID()}`;
  } catch {
    return `queue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function useWatchDiscovery() {
  const { user, loading } = useAuth();
  const [state, setState] = useState<WatchDiscoveryState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<WatchDiscoveryState>(EMPTY_STATE);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const key = storageKey(userId);
    const local = readStored(key);
    const guest = userId ? readStored(STORAGE_KEY) : EMPTY_STATE;
    const immediate = mergeDiscoveryStates(local, guest);
    stateRef.current = immediate;
    setState(immediate);
    setReady(!userId);
    if (!userId) return;

    const controller = new AbortController();
    void fetch("/api/account/discovery", {
      credentials: "same-origin",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("discovery_load_failed");
        const data = (await response.json()) as { state?: unknown };
        // Include the live ref so ratings/queue edits made while GET was in
        // flight are never replaced by the captured hydration snapshot.
        const merged = mergeDiscoveryStates(
          normalizeDiscoveryState(data.state),
          immediate,
          stateRef.current,
        );
        if (cancelled) return;
        stateRef.current = merged;
        setState(merged);
        writeStored(key, merged);
        const syncResponse = await fetch("/api/account/discovery", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: merged }),
        });
        if (syncResponse.ok) localStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loading, userId]);

  useEffect(() => {
    if (loading) return;
    const key = storageKey(userId);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) {
        const next = readStored(key);
        stateRef.current = next;
        setState(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loading, userId]);

  const commit = useCallback((update: (previous: WatchDiscoveryState) => WatchDiscoveryState) => {
    const next = normalizeDiscoveryState(update(stateRef.current));
    stateRef.current = next;
    writeStored(storageKey(userId), next);
    setState(next);
    return next;
  }, [userId]);

  const syncMetadata = useCallback((next: WatchDiscoveryState) => {
    if (!userId) return;
    void fetch("/api/account/workspaces", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "watch-discovery",
        name: "home",
        payload: {
          rowOrder: next.rowOrder,
          rowOrderUpdatedAt: next.rowOrderUpdatedAt,
          feedbackTombstones: next.feedbackTombstones,
          queueTombstones: next.queueTombstones,
        },
      }),
    }).catch(() => undefined);
  }, [userId]);

  const setFeedback = useCallback((itemId: string, value: WatchFeedbackValue | null) => {
    const key = itemId.slice(0, 240);
    const now = new Date().toISOString();
    const next = commit((previous) => {
      const feedback = { ...previous.feedback };
      const feedbackTombstones = { ...previous.feedbackTombstones };
      if (value) {
        feedback[key] = { value, updatedAt: now };
        delete feedbackTombstones[key];
      }
      else delete feedback[key];
      if (!value) feedbackTombstones[key] = now;
      return { ...previous, feedback, feedbackTombstones };
    });
    syncMetadata(next);
    if (userId) {
      const action = value === "like" ? "more" : value === "dislike" ? "less" : value ?? "reset";
      void fetch("/api/watch/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, key }),
      }).catch(() => undefined);
    }
  }, [commit, syncMetadata, userId]);

  const saveQueue = useCallback((queue: WatchNamedQueue) => {
    const normalized = normalizeQueue(queue);
    if (!normalized) return;
    const next = commit((previous) => {
      const queueTombstones = { ...previous.queueTombstones };
      delete queueTombstones[normalized.id];
      return {
        ...previous,
        queueTombstones,
        queues: [normalized, ...previous.queues.filter((item) => item.id !== normalized.id)].slice(0, MAX_QUEUES),
      };
    });
    syncMetadata(next);
    if (userId) {
      void fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "watch-queue", name: normalized.id, payload: normalized }),
      }).catch(() => undefined);
    }
  }, [commit, syncMetadata, userId]);

  const createQueue = useCallback((name: string) => {
    const now = new Date().toISOString();
    const queue: WatchNamedQueue = {
      id: queueId(),
      name: name.trim().slice(0, 50) || "My Queue",
      itemIds: [],
      createdAt: now,
      updatedAt: now,
    };
    saveQueue(queue);
    return queue.id;
  }, [saveQueue]);

  const deleteQueue = useCallback((id: string) => {
    const next = commit((previous) => ({
      ...previous,
      queues: previous.queues.filter((queue) => queue.id !== id),
      queueTombstones: { ...previous.queueTombstones, [id]: new Date().toISOString() },
    }));
    syncMetadata(next);
    if (userId) {
      void fetch(`/api/account/workspaces?kind=watch-queue&name=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => undefined);
    }
  }, [commit, syncMetadata, userId]);

  const toggleQueueItem = useCallback((id: string, itemId: string) => {
    const queue = stateRef.current.queues.find((candidate) => candidate.id === id);
    if (!queue) return;
    const hasItem = queue.itemIds.includes(itemId);
    saveQueue({
      ...queue,
      itemIds: hasItem
        ? queue.itemIds.filter((value) => value !== itemId)
        : [itemId, ...queue.itemIds].slice(0, MAX_QUEUE_ITEMS),
      updatedAt: new Date().toISOString(),
    });
  }, [saveQueue]);

  const renameQueue = useCallback((id: string, name: string) => {
    const queue = stateRef.current.queues.find((candidate) => candidate.id === id);
    if (!queue) return;
    saveQueue({ ...queue, name: name.trim().slice(0, 50) || queue.name, updatedAt: new Date().toISOString() });
  }, [saveQueue]);

  const setRowOrder = useCallback((rowOrder: string[]) => {
    const next = normalizeDiscoveryState({
      ...stateRef.current,
      rowOrder,
      rowOrderUpdatedAt: new Date().toISOString(),
    });
    commit(() => next);
    syncMetadata(next);
  }, [commit, syncMetadata]);

  return {
    state,
    ready,
    setFeedback,
    createQueue,
    saveQueue,
    deleteQueue,
    renameQueue,
    toggleQueueItem,
    setRowOrder,
  };
}
