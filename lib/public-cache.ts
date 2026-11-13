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
  /** Start a source load if an optional shared-cache read is slow. */
  readHedgeMs?: number;
};

/**
 * Public content only. Never put account, billing, or OAuth data here.
 * Treat returned snapshots as immutable; copy before applying page-specific edits.
 */
export function createPublicCache(dependencies: Dependencies) {
  const memory = new Map<string, PublicCacheEntry<unknown>>();
  const pending = new Map<string, Promise<unknown>>();
  const reads = new Map<string, Promise<unknown>>();
  const scheduled = new Set<string>();
  const validations = new WeakMap<PublicCacheEntry<unknown>, WeakSet<(value: unknown) => boolean>>();
  const latestWrites = new Map<string, PublicCacheEntry<unknown>>();
  const writes = new Map<string, Promise<void>>();
  const now = dependencies.now ?? Date.now;

  function remember(key: string, entry: PublicCacheEntry<unknown>) {
    // Release expired archives before evicting a still-useful hot entry.
    for (const [candidate, value] of memory) {
      if (value.staleUntil <= now()) memory.delete(candidate);
    }
    memory.delete(key);
    memory.set(key, entry);
    if (memory.size > 64) memory.delete(memory.keys().next().value!);
  }

  function background(work: () => Promise<void>) {
    const safe = async () => { try { await work(); } catch { /* optional cache work */ } };
    try { dependencies.background(safe); } catch { void safe(); }
  }

  function persist(key: string, entry: PublicCacheEntry<unknown>) {
    latestWrites.set(key, entry);
    // JSON encoding, compression, and an optional Redis outage must not delay
    // the response after the source data is already ready in memory.
    background(async () => {
      const previous = writes.get(key);
      const work = (async () => {
        await previous;
        if (latestWrites.get(key) !== entry) return;
        const ttl = Math.ceil((entry.staleUntil - now()) / 1000);
        if (ttl > 0) {
          try { await dependencies.write(key, entry, ttl); } catch { /* memory remains usable */ }
        }
      })();
      writes.set(key, work);
      try { await work; } finally {
        if (writes.get(key) === work) writes.delete(key);
        if (latestWrites.get(key) === entry) latestWrites.delete(key);
      }
    });
  }

  return async function cached<T>(key: string, load: () => Promise<T>, options: CacheOptions<T>): Promise<T> {
    function valid(raw: unknown): raw is PublicCacheEntry<T> {
      if (!raw || typeof raw !== "object") return false;
      const entry = raw as Partial<PublicCacheEntry<T>>;
      const validDates = typeof entry.freshUntil === "number" && Number.isFinite(entry.freshUntil)
        && typeof entry.staleUntil === "number" && Number.isFinite(entry.staleUntil)
        && entry.freshUntil <= entry.staleUntil && entry.staleUntil > now();
      if (!validDates) return false;
      const snapshot = raw as PublicCacheEntry<T>;
      // A large catalog is immutable in memory. Check each new snapshot and
      // validator once instead of scanning every item for every warm request.
      let checked = validations.get(snapshot);
      if (checked?.has(options.validate)) return true;
      if (!options.validate(entry.value)) return false;
      if (!checked) { checked = new WeakSet(); validations.set(snapshot, checked); }
      checked.add(options.validate);
      return true;
    }

    async function refresh(): Promise<T> {
      const underway = pending.get(key);
      if (underway) return underway as Promise<T>;
      const work = (async () => {
        const value = await load();
        if (options.validate(value) && (!options.shouldCache || options.shouldCache(value))) {
          const createdAt = now();
          const freshUntil = createdAt + options.freshSeconds * 1000;
          const entry = { value, createdAt, freshUntil, staleUntil: freshUntil + options.staleSeconds * 1000 };
          validations.set(entry, new WeakSet([options.validate]));
          remember(key, entry);
          persist(key, entry);
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
        background(async () => {
          try { await refresh(); } catch { /* retain only until staleUntil */ }
          finally { scheduled.delete(key); }
        });
      }
      return entry.value;
    }

    const local = memory.get(key);
    if (valid(local)) {
      // Actual LRU order: repeated channel visits keep their hot snapshot.
      memory.delete(key);
      memory.set(key, local);
      return serve(local);
    }
    memory.delete(key);
    // Include the Redis read in deduplication, so simultaneous cold requests
    // share one read and one rebuild, even when Redis is unavailable.
    const underway = reads.get(key);
    if (underway) return underway as Promise<T>;
    const read = (async () => {
      const remoteRead = Promise.resolve().then(() => dependencies.read(key)).catch(() => null);
      const hedgeMs = dependencies.readHedgeMs;
      let remote: unknown;
      if (hedgeMs !== undefined && Number.isFinite(hedgeMs) && hedgeMs > 0) {
        const slow = Symbol("slow-cache-read");
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          remote = await Promise.race([
            remoteRead,
            new Promise<typeof slow>(resolve => { timer = setTimeout(() => resolve(slow), hedgeMs); }),
          ]);
        } finally { if (timer) clearTimeout(timer); }
        if (remote === slow) {
          // A cold page needn't pay the entire Redis deadline before its source
          // starts. The first usable result wins; a late Redis response never
          // overwrites a newer in-process snapshot.
          let sourceError: unknown;
          const source = refresh().catch(error => { sourceError = error; throw error; });
          try {
            const winner = await Promise.any([
              source.then(async value => {
                // A provider's degraded response should not beat a usable
                // shared snapshot just because it returned first.
                // refresh() remembers only usable values and memoizes their
                // validation, so large catalogs are not scanned a second time.
                const snapshot = memory.get(key);
                if (!valid(snapshot) || snapshot.value !== value) {
                  const entry = await remoteRead;
                  if (valid(entry)) return { kind: "cache" as const, entry };
                }
                return { kind: "source" as const, value };
              }),
              remoteRead.then(entry => {
                if (!valid(entry)) throw new Error("shared_cache_miss");
                return { kind: "cache" as const, entry };
              }),
            ]);
            if (winner.kind === "source") return winner.value;
            const refreshed = memory.get(key);
            if (valid(refreshed)) return serve(refreshed);
            remember(key, winner.entry);
            background(async () => { await source.catch(() => undefined); });
            return serve(winner.entry);
          } catch { throw sourceError; }
        }
      } else remote = await remoteRead;
      if (valid(remote)) { remember(key, remote); return serve(remote); }
      return refresh();
    })();
    reads.set(key, read);
    try { return await read; } finally { if (reads.get(key) === read) reads.delete(key); }
  };
}
