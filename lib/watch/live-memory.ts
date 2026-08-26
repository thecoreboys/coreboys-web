import type { WatchItem } from "./types";

/** Client-side last-live memory so duration survives after they go offline. */

export type RememberedLive = {
  login: string;
  startedAt: string;
  lastSeenAt: string;
  endedAt?: string;
  title?: string;
  /** Retains the exact playable needed to resume a 24/7 rotation after live ends. */
  item?: WatchItem;
};

const KEY = "core-live-memory:v1";

function read(): Record<string, RememberedLive> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, RememberedLive>;
  } catch {
    return {};
  }
}

function write(map: Record<string, RememberedLive>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function syncLiveMemory(
  live: Array<{ login: string; isLive?: boolean; startedAt?: string; title?: string; item?: WatchItem }>,
  options?: { scopeLogins?: readonly string[] },
): Record<string, RememberedLive> {
  const now = new Date().toISOString();
  const map = read();
  const liveLogins = new Set<string>();
  const scopedLogins = options?.scopeLogins
    ? new Set(options.scopeLogins.map((login) => login.trim().toLowerCase()).filter(Boolean))
    : null;

  for (const e of live) {
    if (!e.isLive) continue;
    const login = e.login.toLowerCase();
    liveLogins.add(login);
    map[login] = {
      login,
      startedAt: e.startedAt || map[login]?.startedAt || now,
      lastSeenAt: now,
      title: e.title ?? map[login]?.title,
      item: e.item ?? map[login]?.item,
    };
  }

  for (const [login, row] of Object.entries(map)) {
    if (scopedLogins && !scopedLogins.has(login)) continue;
    if (liveLogins.has(login)) continue;
    if (!row.endedAt) {
      map[login] = { ...row, endedAt: row.lastSeenAt || now, lastSeenAt: row.lastSeenAt || now };
    }
  }

  write(map);
  return map;
}

export function rememberedFor(login: string): RememberedLive | null {
  return read()[login.toLowerCase()] ?? null;
}
