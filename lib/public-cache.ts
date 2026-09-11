export type PublicCacheEntry<T> = { value: T; freshUntil: number; staleUntil: number; createdAt?: number };
type CacheOptions<T> = {
  freshSeconds: number;
  staleSeconds: number;
  validate: (value: unknown) => value is T;
  shouldCache?: (value: T) => boolean;
};
type Dependencies = {
  read: (key: string) => Promise<unknown>;
  write: (key: string, value: unknown, ttl: number) => Promise<unknown>;
  background: (work: () => Promise<void>) => void;
  now?: () => number;
};

/** Public content only. Never put account, billing, or OAuth data here. */
export function createPublicCache(dependencies: Dependencies) {
  const memory = new Map<string, PublicCacheEntry<unknown>>();
  const pending = new Map<string, Promise<unknown>>();
  const scheduled = new Set<string>();
  const now = dependencies.now ?? Date.now;

  function remember(key: string, entry: PublicCacheEntry<unknown>) {
    memory.delete(key);
    memory.set(key, entry);
    if (memory.size > 64) memory.delete(memory.keys().next().value!);
  }

  return async function cached<T>(key: string, load: () => Promise<T>, options: CacheOptions<T>): Promise<T> {
    function valid(raw: unknown): raw is PublicCacheEntry<T> {
      if (!raw || typeof raw !== "object") return false;
      const entry = raw as Partial<PublicCacheEntry<T>>;
      return typeof entry.freshUntil === "number" && Number.isFinite(entry.freshUntil)
        && typeof entry.staleUntil === "number" && Number.isFinite(entry.staleUntil)
        && entry.freshUntil <= entry.staleUntil && entry.staleUntil > now()
        && options.validate(entry.value);
    }

    async function refresh(): Promise<T> {
      const underway = pending.get(key);
      if (underway) return underway as Promise<T>;
      const work = (async () => {
        const value = await load();
        if (!options.shouldCache || options.shouldCache(value)) {
          const createdAt = now();
          const freshUntil = createdAt + options.freshSeconds * 1000;
          const entry = { value, createdAt, freshUntil, staleUntil: freshUntil + options.staleSeconds * 1000 };
          remember(key, entry);
          try { await dependencies.write(key, entry, options.freshSeconds + options.staleSeconds); } catch { /* memory remains usable */ }
        }
        return value;
      })();
      pending.set(key, work);
      try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
    }

    function serve(entry: PublicCacheEntry<T>): T {
      // A channel can become live while its archive still has an offline TTL.
      // Honor a stricter current freshness policy without discarding its usable
      // stale snapshot or extending its original expiry.
      const freshUntil = typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
        ? Math.min(entry.freshUntil, entry.createdAt + options.freshSeconds * 1000)
        : entry.freshUntil;
      if (freshUntil <= now() && !scheduled.has(key) && !pending.has(key)) {
        scheduled.add(key);
        dependencies.background(async () => {
          try { await refresh(); } catch { /* retain only until staleUntil */ }
          finally { scheduled.delete(key); }
        });
      }
      return entry.value;
    }

    const local = memory.get(key);
    if (valid(local)) return serve(local);
    // Include the Redis read in deduplication, so simultaneous cold requests
    // share one read and one rebuild, even when Redis is unavailable.
    const underway = pending.get(`${key}:read`);
    if (underway) return underway as Promise<T>;
    const read = (async () => {
      let remote: unknown;
      try { remote = await dependencies.read(key); } catch { remote = null; }
      if (valid(remote)) { remember(key, remote); return serve(remote); }
      return refresh();
    })();
    pending.set(`${key}:read`, read);
    try { return await read; } finally { pending.delete(`${key}:read`); }
  };
}
