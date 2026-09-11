const KEY = "coreboys-watch-list:v1";
const HIDDEN = "coreboys-watch-hidden:v1";

export const MY_LIST_EVENT = "core-my-list-change";
export const MY_LIST_STATUS_EVENT = "core-my-list-status";
export const MY_LIST_REQUEST_TIMEOUT_MS = 12_000;

let activeKey: string | null = null;
let activeUserId: string | null = null;
let activeCache: string[] = [];
let status = { syncing: false, error: null as string | null };
let revision = 0;
let syncedAt = 0;
let pendingSync: { userId: string; request: Promise<string[]> } | null = null;
let writeQueue = Promise.resolve();
const itemVersions = new Map<string, number>();

async function requestList(init: RequestInit) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("list_timeout"));
    }, MY_LIST_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch("/api/account/list", { ...init, signal: controller.signal });
        // Keep response-body reads inside the deadline as well as headers.
        const data = await response.json() as { accountId?: unknown; ids?: unknown };
        return { response, data };
      })(),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function readMyListStatus() { return status; }

function setStatus(next: typeof status) {
  status = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MY_LIST_STATUS_EVENT));
}

function persist(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Server saves still work when storage is unavailable. */ }
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 80);
}

function readKey(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeIds(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}

function announce(ids: string[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MY_LIST_EVENT, { detail: ids }));
}

function discardLegacyGuestList() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}

export function readMyList(): string[] {
  if (typeof window === "undefined" || !activeKey) return [];
  return activeCache;
}

export function selectMyListAccount(userId: string | null): string[] {
  if (activeUserId === userId) return activeCache;
  discardLegacyGuestList();
  activeUserId = userId;
  activeKey = userId ? `${KEY}:${userId}` : null;
  activeCache = activeKey ? readKey(activeKey) : [];
  revision += 1;
  syncedAt = 0;
  itemVersions.clear();
  setStatus({ syncing: false, error: null });
  announce(activeCache);
  return activeCache;
}

export function refreshMyListFromStorage(): string[] {
  activeCache = activeKey ? readKey(activeKey) : [];
  announce(activeCache);
  return activeCache;
}

export function toggleMyList(id: string): string[] {
  if (typeof window === "undefined" || !activeKey || !activeUserId) return [];

  const userId = activeUserId;
  const accountKey = activeKey;
  const previous = activeCache;
  const version = ++revision;
  itemVersions.set(id, version);
  const saved = !activeCache.includes(id);
  const next = saved
    ? [id, ...activeCache.filter((itemId) => itemId !== id)]
    : activeCache.filter((itemId) => itemId !== id);

  activeCache = next.slice(0, 80);
  persist(activeKey, activeCache);
  announce(activeCache);
  setStatus({ ...status, error: null });

  // Serialize rapid save/remove clicks so a slow save cannot arrive after a
  // newer removal. List reads below also wait for pending writes.
  writeQueue = writeQueue.then(async () => {
    if (activeUserId !== userId) return;
    const { response } = await requestList({
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: userId, id, saved }),
    });
    if (!response.ok) throw new Error("save_failed");
    if (activeUserId === userId) syncedAt = 0;
  }).catch(() => {
    if (activeUserId !== userId || activeKey !== accountKey) return;
    if (itemVersions.get(id) === version) {
      const rest = activeCache.filter((itemId) => itemId !== id);
      const previousIndex = previous.indexOf(id);
      if (previousIndex >= 0) rest.splice(Math.min(previousIndex, rest.length), 0, id);
      activeCache = rest;
      persist(accountKey, activeCache);
      announce(activeCache);
    }
    setStatus({ ...status, error: "Your DVR change could not be saved. Please try again." });
  });

  return activeCache;
}

export function syncMyList(userId: string, force = false): Promise<string[]> {
  if (pendingSync?.userId === userId) return pendingSync.request;
  const accountKey = `${KEY}:${userId}`;
  selectMyListAccount(userId);
  if (!force && syncedAt > 0 && Date.now() - syncedAt < 30_000) return Promise.resolve(activeCache);
  setStatus({ syncing: true, error: null });

  const request = (async () => {
    try {
      await writeQueue;
      if (activeUserId !== userId) return readMyList();
      const readRevision = revision;
      const { response, data } = await requestList({
        method: "GET",
        headers: { "x-core-account-id": userId },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (data.accountId !== userId) throw new Error("account_changed");
      if (response.status === 403) {
        if (activeUserId === userId && activeKey === accountKey) {
          activeCache = [];
          try { localStorage.removeItem(accountKey); } catch { /* Storage is optional. */ }
          announce(activeCache);
        }
        return [];
      }
      if (!response.ok) throw new Error("list_unavailable");

      const ids = normalizeIds(data.ids);
      if (activeUserId !== userId || activeKey !== accountKey) return readMyList();
      if (readRevision !== revision) return activeCache;

      activeCache = ids;
      syncedAt = Date.now();
      persist(accountKey, ids);
      announce(ids);
      return ids;
    } catch {
      if (activeUserId === userId) setStatus({ ...status, error: "DVR could not sync. Your saved copy is shown below." });
      return activeUserId === userId ? activeCache : readMyList();
    } finally {
      if (activeUserId === userId) setStatus({ ...status, syncing: false });
    }
  })();
  pendingSync = { userId, request };
  void request.finally(() => { if (pendingSync?.request === request) pendingSync = null; });
  return request;
}

export function redirectToMyListSignIn(returnTo?: string) {
  if (typeof window === "undefined") return;
  const requested = returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const safeReturn = requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\")
    ? requested
    : "/";
  // Saving is account-scoped. Keep viewers in their current context and let
  // the shared route-free dialog handle sign-in rather than navigating away.
  openAuthModal({ mode: "login", next: safeReturn });
}

export function readHiddenMembers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeIds(JSON.parse(localStorage.getItem(HIDDEN) ?? "[]"));
  } catch {
    return [];
  }
}

export function toggleHiddenMember(slug: string): string[] {
  const current = readHiddenMembers();
  const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
  localStorage.setItem(HIDDEN, JSON.stringify(next));
  return next;
}
import { openAuthModal } from "@/lib/auth/modal";
