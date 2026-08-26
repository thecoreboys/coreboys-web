"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

export type WatchReminder = {
  id: string;
  itemRef: string;
  title: string;
  href: string;
  startsAt: string;
  memberSlug: string | null;
  platform: string | null;
  enabled: boolean;
  updatedAt?: string;
};

type WatchReminderTombstone = { id: string; deletedAt: string };
type WatchReminderTombstones = Record<string, string>;

export type BrowserAlertState = NotificationPermission | "unsupported" | "insecure";

const GUEST_REMINDERS = "core-watch-reminders:guest:v1";
const GUEST_REMINDER_TOMBSTONES = "core-watch-reminder-tombstones:guest:v1";
const GUEST_ALERTS = "core-watch-alerts:guest:v1";
const WATCH_REMINDERS_SYNC_EVENT = "core:watch-reminders-sync";

function accountReminderKey(userId: string) {
  return `core-watch-reminders:${userId}:v1`;
}

function accountAlertKey(userId: string) {
  return `core-watch-alerts:${userId}:v1`;
}

function accountReminderTombstoneKey(userId: string) {
  return `core-watch-reminder-tombstones:${userId}:v1`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // In-memory state remains functional when storage is unavailable.
  }
}

function notifyReminderConsumers() {
  if (typeof window === "undefined") return;
  // State updaters may run during React's render checks. Defer the shared
  // notification so a second hook instance never updates synchronously while
  // the first one is calculating its next value.
  window.queueMicrotask(() => window.dispatchEvent(new Event(WATCH_REMINDERS_SYNC_EVENT)));
}

function mergeReminders(...groups: WatchReminder[][]): WatchReminder[] {
  const byId = new Map<string, WatchReminder>();
  for (const item of groups.flat()) {
    const known = byId.get(item.id);
    const itemTimestamp = Date.parse(item.updatedAt ?? "");
    const knownTimestamp = Date.parse(known?.updatedAt ?? "");
    if (
      !known
      || (Number.isFinite(itemTimestamp) ? itemTimestamp : 0)
        >= (Number.isFinite(knownTimestamp) ? knownTimestamp : 0)
    ) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()]
    .filter((item) => Number.isFinite(Date.parse(item.startsAt)))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 100);
}

function mergeReminderTombstones(...groups: WatchReminderTombstones[]): WatchReminderTombstones {
  const merged: WatchReminderTombstones = {};
  for (const group of groups) {
    for (const [id, deletedAt] of Object.entries(group)) {
      if (!id || id.length > 200 || !Number.isFinite(Date.parse(deletedAt))) continue;
      if (!merged[id] || Date.parse(deletedAt) >= Date.parse(merged[id]!)) merged[id] = deletedAt;
    }
  }
  return Object.fromEntries(
    Object.entries(merged)
      .sort((left, right) => Date.parse(right[1]) - Date.parse(left[1]))
      .slice(0, 200),
  );
}

function readReminderTombstones(key: string): WatchReminderTombstones {
  const value = readJson<unknown>(key, {});
  return value && typeof value === "object" && !Array.isArray(value)
    ? mergeReminderTombstones(value as WatchReminderTombstones)
    : {};
}

function tombstoneArray(value: WatchReminderTombstones): WatchReminderTombstone[] {
  return Object.entries(value).map(([id, deletedAt]) => ({ id, deletedAt }));
}

function tombstoneMap(value: WatchReminderTombstone[]): WatchReminderTombstones {
  return mergeReminderTombstones(Object.fromEntries(value.map((entry) => [entry.id, entry.deletedAt])));
}

function applyReminderTombstones(
  reminders: WatchReminder[],
  tombstones: WatchReminderTombstones,
): WatchReminder[] {
  return reminders.filter((reminder) => {
    const deletedAt = tombstones[reminder.id];
    if (!deletedAt) return true;
    const updatedAt = Date.parse(reminder.updatedAt ?? "");
    return Number.isFinite(updatedAt) && updatedAt > Date.parse(deletedAt);
  });
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function makeReminderId(itemRef: string, startsAt: string): string {
  return `watch-${hash(`${itemRef}:${startsAt}`)}`;
}

function currentBrowserState(): BrowserAlertState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext && window.location.hostname !== "localhost") return "insecure";
  return Notification.permission;
}

export function useWatchReminders() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WatchReminder[]>([]);
  const [creatorAlerts, setCreatorAlerts] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [browserState, setBrowserState] = useState<BrowserAlertState>("unsupported");
  const reminderKey = user ? accountReminderKey(user.id) : GUEST_REMINDERS;
  const reminderTombstoneKey = user
    ? accountReminderTombstoneKey(user.id)
    : GUEST_REMINDER_TOMBSTONES;
  const alertKey = user ? accountAlertKey(user.id) : GUEST_ALERTS;

  useEffect(() => setBrowserState(currentBrowserState()), []);

  useEffect(() => {
    if (authLoading) return;
    const refreshLocalState = () => {
      setItems(applyReminderTombstones(
        mergeReminders(readJson<WatchReminder[]>(reminderKey, [])),
        readReminderTombstones(reminderTombstoneKey),
      ));
      setCreatorAlerts(readJson<Record<string, boolean>>(alertKey, {}));
      setBrowserState(currentBrowserState());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === reminderKey || event.key === reminderTombstoneKey || event.key === alertKey) refreshLocalState();
    };
    window.addEventListener(WATCH_REMINDERS_SYNC_EVENT, refreshLocalState);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WATCH_REMINDERS_SYNC_EVENT, refreshLocalState);
      window.removeEventListener("storage", onStorage);
    };
  }, [alertKey, authLoading, reminderKey, reminderTombstoneKey]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setReady(false);
    const localReminders = readJson<WatchReminder[]>(reminderKey, []);
    const localTombstones = readReminderTombstones(reminderTombstoneKey);
    const localAlerts = readJson<Record<string, boolean>>(alertKey, {});

    if (!user) {
      setItems(applyReminderTombstones(mergeReminders(localReminders), localTombstones));
      setCreatorAlerts(localAlerts);
      setReady(true);
      return;
    }

    const guestReminders = readJson<WatchReminder[]>(GUEST_REMINDERS, []);
    const guestTombstones = readReminderTombstones(GUEST_REMINDER_TOMBSTONES);
    const guestAlerts = readJson<Record<string, boolean>>(GUEST_ALERTS, {});
    void Promise.all([
      fetch("/api/account/reminders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: mergeReminders(localReminders, guestReminders),
          tombstones: tombstoneArray(mergeReminderTombstones(localTombstones, guestTombstones)),
        }),
      }).then(async (response) => ({
        saved: response.ok,
        ...(response.ok
          ? await response.json() as { items?: WatchReminder[]; tombstones?: WatchReminderTombstone[] }
          : { items: localReminders, tombstones: tombstoneArray(localTombstones) }),
      })).catch(() => ({
        saved: false,
        items: localReminders,
        tombstones: tombstoneArray(localTombstones),
      })),
      fetch("/api/account/notifications", { credentials: "same-origin" })
        .then(async (response) => response.ok
          ? (await response.json() as { prefs?: Array<{ scope: string; liveOptIn: boolean }> }).prefs ?? []
          : []),
    ]).then(async ([remoteReminderResult, remotePrefs]) => {
      if (cancelled) return;
      const liveLocalReminders = readJson<WatchReminder[]>(reminderKey, []);
      const liveLocalTombstones = readReminderTombstones(reminderTombstoneKey);
      const mergedTombstones = mergeReminderTombstones(
        localTombstones,
        guestTombstones,
        liveLocalTombstones,
        tombstoneMap(remoteReminderResult.tombstones ?? []),
      );
      const merged = applyReminderTombstones(
        mergeReminders(remoteReminderResult.items ?? [], localReminders, guestReminders, liveLocalReminders),
        mergedTombstones,
      );
      const alertMap = { ...localAlerts };
      for (const pref of remotePrefs) alertMap[pref.scope] = pref.liveOptIn;
      const unsyncedGuestAlerts: Record<string, boolean> = {};
      for (const [scope, enabled] of Object.entries(guestAlerts)) {
        if (!enabled) continue;
        alertMap[scope] = true;
        const response = await fetch("/api/account/notifications", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope, liveOptIn: true }),
        }).catch(() => null);
        if (!response?.ok) unsyncedGuestAlerts[scope] = true;
      }
      setItems(merged);
      setCreatorAlerts(alertMap);
      writeJson(reminderKey, merged);
      writeJson(reminderTombstoneKey, mergedTombstones);
      writeJson(alertKey, alertMap);
      notifyReminderConsumers();
      try {
        if (remoteReminderResult.saved) {
          localStorage.removeItem(GUEST_REMINDERS);
          localStorage.removeItem(GUEST_REMINDER_TOMBSTONES);
        }
        if (Object.keys(unsyncedGuestAlerts).length) {
          writeJson(GUEST_ALERTS, unsyncedGuestAlerts);
        } else {
          localStorage.removeItem(GUEST_ALERTS);
        }
      } catch {
        // Guest state remains available when storage is restricted.
      }
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      setItems(applyReminderTombstones(
        mergeReminders(localReminders, guestReminders),
        mergeReminderTombstones(localTombstones, guestTombstones),
      ));
      setCreatorAlerts({ ...localAlerts, ...guestAlerts });
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [alertKey, authLoading, reminderKey, reminderTombstoneKey, user]);

  const saveReminder = useCallback(async (input: Omit<WatchReminder, "updatedAt">) => {
    const item: WatchReminder = { ...input, updatedAt: new Date().toISOString() };
    const tombstones = readReminderTombstones(reminderTombstoneKey);
    delete tombstones[item.id];
    writeJson(reminderTombstoneKey, tombstones);
    setItems((previous) => {
      const next = mergeReminders(previous, [item]);
      writeJson(reminderKey, next);
      notifyReminderConsumers();
      return next;
    });
    if (!user) return;
    const response = await fetch("/api/account/reminders", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    }).catch(() => null);
    if (!response?.ok) return;
    const saved = (await response.json().catch(() => null) as { item?: WatchReminder } | null)?.item;
    if (!saved?.updatedAt) return;
    setItems((previous) => {
      const next = previous.map((entry) => (
        entry.id === item.id && entry.updatedAt === item.updatedAt ? saved : entry
      ));
      writeJson(reminderKey, next);
      notifyReminderConsumers();
      return next;
    });
  }, [reminderKey, reminderTombstoneKey, user]);

  const removeReminder = useCallback(async (id: string) => {
    const deletedAt = new Date().toISOString();
    const tombstones = mergeReminderTombstones(
      readReminderTombstones(reminderTombstoneKey),
      { [id]: deletedAt },
    );
    writeJson(reminderTombstoneKey, tombstones);
    setItems((previous) => {
      const next = previous.filter((item) => item.id !== id);
      writeJson(reminderKey, next);
      notifyReminderConsumers();
      return next;
    });
    if (!user) return;
    const response = await fetch(`/api/account/reminders?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => null);
    if (!response?.ok) return;
    const serverTombstone = (await response.json().catch(() => null) as {
      tombstone?: WatchReminderTombstone;
    } | null)?.tombstone;
    if (!serverTombstone) return;
    writeJson(
      reminderTombstoneKey,
      mergeReminderTombstones(readReminderTombstones(reminderTombstoneKey), {
        [serverTombstone.id]: serverTombstone.deletedAt,
      }),
    );
    notifyReminderConsumers();
  }, [reminderKey, reminderTombstoneKey, user]);

  const toggleCreatorAlert = useCallback(async (scope: string, enabled?: boolean) => {
    const nextValue = enabled ?? !creatorAlerts[scope];
    setCreatorAlerts((previous) => {
      const next = { ...previous, [scope]: nextValue };
      writeJson(alertKey, next);
      notifyReminderConsumers();
      return next;
    });
    if (!user) return nextValue;
    const response = await fetch("/api/account/notifications", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, liveOptIn: nextValue }),
    }).catch(() => null);
    return response?.ok ? nextValue : nextValue;
  }, [alertKey, creatorAlerts, user]);

  const requestBrowserAlerts = useCallback(async (): Promise<BrowserAlertState> => {
    const state = currentBrowserState();
    if (state === "unsupported" || state === "insecure" || state === "denied") {
      setBrowserState(state);
      return state;
    }
    if (state === "granted") return state;
    // This function is intentionally only exposed to click/tap handlers.
    const permission = await Notification.requestPermission();
    setBrowserState(permission);
    notifyReminderConsumers();
    return permission;
  }, []);

  const reminderIds = useMemo(() => new Set(items.filter((item) => item.enabled).map((item) => item.id)), [items]);

  return {
    items,
    reminderIds,
    creatorAlerts,
    browserState,
    ready,
    saveReminder,
    removeReminder,
    toggleCreatorAlert,
    requestBrowserAlerts,
  };
}
