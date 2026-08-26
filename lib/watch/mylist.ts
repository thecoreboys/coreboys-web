const KEY = "coreboys-watch-list:v1";
const HIDDEN = "coreboys-watch-hidden:v1";

export const MY_LIST_EVENT = "core-my-list-change";

let activeKey: string | null = null;
let activeUserId: string | null = null;
let activeCache: string[] = [];

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
  localStorage.removeItem(KEY);
}

export function readMyList(): string[] {
  if (typeof window === "undefined" || !activeKey) return [];
  return activeCache;
}

export function selectMyListAccount(userId: string | null): string[] {
  discardLegacyGuestList();
  activeUserId = userId;
  activeKey = userId ? `${KEY}:${userId}` : null;
  activeCache = activeKey ? readKey(activeKey) : [];
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
  const saved = !activeCache.includes(id);
  const next = saved
    ? [id, ...activeCache.filter((itemId) => itemId !== id)]
    : activeCache.filter((itemId) => itemId !== id);

  activeCache = next.slice(0, 80);
  localStorage.setItem(activeKey, JSON.stringify(activeCache));
  announce(activeCache);

  void fetch("/api/account/list", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, saved }),
  }).then((response) => {
    if (!response.ok && activeUserId === userId) void syncMyList(userId);
  }).catch(() => {
    // Keep the signed-in account cache usable offline. The next account
    // hydration is server-authoritative and reconciles the local copy.
  });

  return activeCache;
}

export async function syncMyList(userId: string): Promise<string[]> {
  const accountKey = `${KEY}:${userId}`;
  selectMyListAccount(userId);

  try {
    const response = await fetch("/api/account/list", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return activeUserId === userId ? activeCache : readMyList();

    const data = (await response.json()) as { ids?: unknown };
    const ids = normalizeIds(data.ids);
    if (activeUserId !== userId || activeKey !== accountKey) return readMyList();

    activeCache = ids;
    localStorage.setItem(accountKey, JSON.stringify(ids));
    announce(ids);
    return ids;
  } catch {
    return activeUserId === userId ? activeCache : readMyList();
  }
}

export function redirectToMyListSignIn(returnTo?: string) {
  if (typeof window === "undefined") return;
  const requested = returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const safeReturn = requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\")
    ? requested
    : "/";
  window.location.assign(`/login?next=${encodeURIComponent(safeReturn)}`);
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
