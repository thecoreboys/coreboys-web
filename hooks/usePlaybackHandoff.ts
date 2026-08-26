"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Playable } from "@/lib/watch/playable";
import { useAuth } from "@/components/providers/AuthProvider";

const LOCAL_KEY = "core-playback-handoff:v1";
const DEVICE_KEY = "core-playback-device:v1";
const DISMISSED_KEY = "core-playback-handoff-dismissed:v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export type HandoffPreferences = {
  captionsEnabled: boolean;
  playbackRate: number;
  qualityPreference: "auto" | "best" | "balanced" | "data-saver";
  audioDescription: boolean;
  accessibilityPreset: "standard" | "captions" | "audio-description" | "calm";
};

export type PlaybackHandoff = {
  version: 1;
  deviceId: string;
  deviceLabel: string;
  item: Playable;
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  preferences: HandoffPreferences;
  updatedAt: string;
};

function deviceLabel() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const browser = /Edg\//.test(navigator.userAgent)
    ? "Edge"
    : /Firefox\//.test(navigator.userAgent)
      ? "Firefox"
      : /Safari\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent)
        ? "Safari"
        : "browser";
  return `${mobile ? "Mobile" : "Desktop"} ${browser}`;
}

function playbackDeviceId() {
  try {
    const known = localStorage.getItem(DEVICE_KEY);
    if (known && /^[A-Za-z0-9_-]{8,100}$/.test(known)) return known;
    const created = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalizedHandoff(value: unknown, authoritativeUpdatedAt?: string): PlaybackHandoff | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<PlaybackHandoff>;
  const item = snapshot.item as Partial<Playable> | undefined;
  if (
    snapshot.version !== 1 ||
    typeof snapshot.deviceId !== "string" ||
    typeof snapshot.deviceLabel !== "string" ||
    typeof snapshot.updatedAt !== "string" ||
    !item ||
    typeof item.key !== "string" ||
    typeof item.title !== "string" ||
    typeof item.platform !== "string"
  ) return null;
  const serverTimestamp = Date.parse(authoritativeUpdatedAt ?? "");
  const payloadTimestamp = Date.parse(snapshot.updatedAt);
  const timestamp = Number.isFinite(serverTimestamp) ? serverTimestamp : payloadTimestamp;
  const now = Date.now();
  if (!Number.isFinite(timestamp) || now - timestamp > MAX_AGE_MS) return null;
  // A misconfigured device clock must not monopolize handoff ordering for
  // hours or days. Small clock differences remain intact; implausible future
  // stamps are bounded to the receiving device's current time.
  const safeTimestamp = timestamp > now + MAX_FUTURE_SKEW_MS ? now : timestamp;
  return {
    version: 1,
    deviceId: snapshot.deviceId.slice(0, 100),
    deviceLabel: snapshot.deviceLabel.slice(0, 80),
    item: snapshot.item as Playable,
    positionSeconds: Math.max(0, Number(snapshot.positionSeconds) || 0),
    durationSeconds: Math.max(0, Number(snapshot.durationSeconds) || 0),
    playing: Boolean(snapshot.playing),
    preferences: {
      captionsEnabled: Boolean(snapshot.preferences?.captionsEnabled),
      playbackRate: Math.min(2, Math.max(0.5, Number(snapshot.preferences?.playbackRate) || 1)),
      qualityPreference: ["auto", "best", "balanced", "data-saver"].includes(snapshot.preferences?.qualityPreference ?? "")
        ? snapshot.preferences!.qualityPreference
        : "auto",
      audioDescription: Boolean(snapshot.preferences?.audioDescription),
      accessibilityPreset: ["standard", "captions", "audio-description", "calm"].includes(snapshot.preferences?.accessibilityPreset ?? "")
        ? snapshot.preferences!.accessibilityPreset
        : "standard",
    },
    updatedAt: new Date(safeTimestamp).toISOString(),
  };
}

function readLocal(): PlaybackHandoff | null {
  try {
    return normalizedHandoff(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null"));
  } catch {
    return null;
  }
}

/** Account-backed playback handoff with a same-browser guest fallback. */
export function usePlaybackHandoff() {
  const { user, loading: authLoading } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [candidate, setCandidate] = useState<PlaybackHandoff | null>(null);
  const deviceRef = useRef("");
  const dismissedAtRef = useRef(0);
  const suppressPublishUntilRef = useRef(0);
  const pendingWriteRef = useRef<Promise<unknown>>(Promise.resolve());

  const consider = useCallback((snapshot: PlaybackHandoff | null) => {
    if (!snapshot) return;
    if (deviceRef.current && snapshot.deviceId === deviceRef.current) return;
    const updatedAt = Date.parse(snapshot.updatedAt);
    if (updatedAt <= dismissedAtRef.current) return;
    setCandidate((current) => {
      if (current && Date.parse(current.updatedAt) >= updatedAt) return current;
      return snapshot;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (authLoading || !user) return;
    try {
      const response = await fetch("/api/account/workspaces?kind=playback", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json() as { items?: Array<{ name?: string; payload?: unknown; updatedAt?: string }> };
      const newest = (data.items ?? [])
        // The workspace row timestamp is server-authored and therefore a
        // safer freshness signal than the publishing device's wall clock.
        .map((item) => normalizedHandoff(item.payload, item.updatedAt))
        .filter((item): item is PlaybackHandoff => Boolean(item && item.deviceId !== deviceRef.current))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
      consider(newest);
    } catch {
      // Guest/offline mode continues through localStorage.
    }
  }, [authLoading, consider, user]);

  useEffect(() => {
    const id = playbackDeviceId();
    deviceRef.current = id;
    setDeviceId(id);
    try {
      dismissedAtRef.current = Number(sessionStorage.getItem(DISMISSED_KEY)) || 0;
    } catch {
      dismissedAtRef.current = 0;
    }
    // Local state is still the guest durability layer, but a browser must not
    // present its own checkpoint as though it came from another device.
    consider(readLocal());
    void refresh();
    const interval = window.setInterval(() => void refresh(), 20_000);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOCAL_KEY || !event.newValue) return;
      try { consider(normalizedHandoff(JSON.parse(event.newValue))); } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [consider, refresh]);

  const publish = useCallback((input: Omit<PlaybackHandoff, "version" | "deviceId" | "deviceLabel" | "updatedAt">) => {
    const id = deviceRef.current;
    if (!id || Date.now() < suppressPublishUntilRef.current) return;
    const snapshot: PlaybackHandoff = {
      ...input,
      version: 1,
      deviceId: id,
      deviceLabel: deviceLabel(),
      updatedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot)); } catch { /* best effort */ }
    if (!user) return;
    pendingWriteRef.current = pendingWriteRef.current
      .catch(() => undefined)
      .then(() => fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "playback", name: `device-${id}`, payload: snapshot }),
      }))
      .catch(() => undefined);
  }, [user]);

  const dismiss = useCallback(() => {
    const timestamp = Date.now();
    dismissedAtRef.current = timestamp;
    setCandidate(null);
    try { sessionStorage.setItem(DISMISSED_KEY, String(timestamp)); } catch { /* best effort */ }
  }, []);

  const clear = useCallback(() => {
    dismiss();
    suppressPublishUntilRef.current = Date.now() + 1_500;
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* best effort */ }
    const id = deviceRef.current;
    if (!user || !id) return;
    void pendingWriteRef.current.finally(() => fetch(
      `/api/account/workspaces?kind=playback&name=${encodeURIComponent(`device-${id}`)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
        keepalive: true,
      },
    ).catch(() => undefined));
  }, [dismiss, user]);

  return { deviceId, candidate, publish, dismiss, clear, refresh };
}
