import test from "node:test";
import assert from "node:assert/strict";
import { createPublicCache } from "../lib/public-cache";

const options = { freshSeconds: 20, staleSeconds: 40, validate: (value: unknown): value is string => typeof value === "string" };

test("a stalled Redis read does not delay a ready source or overwrite it when the old snapshot arrives", async () => {
  let finishRead!: (value: unknown) => void;
  let loads = 0;
  const cache = createPublicCache({
    readHedgeMs: 1,
    read: () => new Promise(resolve => { finishRead = resolve; }),
    write: async () => {}, background: () => {},
  });
  const load = async () => { loads++; return "fresh source"; };
  assert.deepEqual(await Promise.all([cache("home", load, options), cache("home", load, options)]), ["fresh source", "fresh source"]);
  assert.equal(loads, 1);
  finishRead({ value: "older Redis", freshUntil: Date.now() + 20_000, staleUntil: Date.now() + 60_000 });
  await Promise.resolve();
  assert.equal(await cache("home", load, options), "fresh source");
});

test("a valid Redis snapshot can win while a slower source is being warmed", async () => {
  let finishRead!: (value: unknown) => void;
  let finishSource!: (value: string) => void;
  let sourceStarted!: () => void;
  const started = new Promise<void>(resolve => { sourceStarted = resolve; });
  const background: Array<() => Promise<void>> = [];
  const cache = createPublicCache({ readHedgeMs: 1,
    read: () => new Promise(resolve => { finishRead = resolve; }), write: async () => {},
    background: work => { background.push(work); },
  });
  const response = cache("home", () => { sourceStarted(); return new Promise<string>(resolve => { finishSource = resolve; }); }, options);
  await started;
  finishRead({ value: "Redis snapshot", freshUntil: Date.now() + 20_000, staleUntil: Date.now() + 60_000 });
  assert.equal(await response, "Redis snapshot");
  finishSource("fresh source");
  while (background.length) await background.shift()!();
  assert.equal(await cache("home", async () => "unused", options), "fresh source");
});

test("a hedged cold miss preserves the source error when both cache and source fail", async () => {
  const cache = createPublicCache({ readHedgeMs: 1,
    read: async () => { await new Promise(resolve => setTimeout(resolve, 5)); return null; },
    write: async () => {}, background: () => {},
  });
  await assert.rejects(cache("home", async () => { throw new Error("source unavailable"); }, options), /source unavailable/);
});

test("a degraded source cannot beat a usable delayed Redis snapshot", async () => {
  let finishRead!: (value: unknown) => void;
  let sourceStarted!: () => void;
  const started = new Promise<void>(resolve => { sourceStarted = resolve; });
  const cache = createPublicCache({ readHedgeMs: 1,
    read: () => new Promise(resolve => { finishRead = resolve; }),
    write: async () => {}, background: () => {},
  });
  const policy = { ...options, shouldCache: (value: string) => value.length > 0 };
  const response = cache("home", async () => { sourceStarted(); return ""; }, policy);
  await started;
  finishRead({ value: "usable archive", freshUntil: Date.now() + 20_000, staleUntil: Date.now() + 60_000 });
  assert.equal(await response, "usable archive");
  assert.equal(await cache("home", async () => "unused", policy), "usable archive");
});

test("a degraded source still returns when the delayed Redis read misses", async () => {
  let finishRead!: (value: unknown) => void;
  let sourceStarted!: () => void;
  const started = new Promise<void>(resolve => { sourceStarted = resolve; });
  const cache = createPublicCache({ readHedgeMs: 1,
    read: () => new Promise(resolve => { finishRead = resolve; }),
    write: async () => {}, background: () => {},
  });
  const response = cache("home", async () => { sourceStarted(); return ""; }, { ...options, shouldCache: value => value.length > 0 });
  await started;
  finishRead(null);
  assert.equal(await response, "");
});

function harness() {
  let clock = 100_000;
  let reads = 0;
  const storage = new Map<string, unknown>();
  const background: Array<() => Promise<void>> = [];
  const dependencies = {
    read: async (key: string) => { reads++; return storage.get(key); },
    write: async (key: string, value: unknown) => { storage.set(key, value); },
    background: (work: () => Promise<void>) => { background.push(work); },
    now: () => clock,
  };
  return { cache: createPublicCache(dependencies), dependencies, storage, background,
    flush: async () => { while (background.length) await background.shift()!(); },
    advance: (milliseconds: number) => { clock += milliseconds; }, reads: () => reads };
}

test("simultaneous cold renders share one Redis read and one catalog load", async () => {
  const h = harness();
  let loads = 0;
  const load = async () => { loads++; return "catalog"; };
  assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => h.cache("catalog", load, options))), Array(20).fill("catalog"));
  assert.equal(loads, 1);
  assert.equal(h.reads(), 1);
  assert.equal(await h.cache("catalog", load, options), "catalog");
  assert.equal(h.reads(), 1);
});

test("another server instance reuses the shared snapshot", async () => {
  const h = harness();
  await h.cache("catalog", async () => "shared", options);
  await h.flush();
  const replica = createPublicCache(h.dependencies);
  assert.equal(await replica("catalog", async () => { throw new Error("must not load"); }, options), "shared");
});

test("stale data returns immediately and queues only one background refresh", async () => {
  const h = harness();
  await h.cache("catalog", async () => "old", options);
  await h.flush();
  h.advance(21_000);
  let loads = 0;
  const load = async () => { loads++; return "new"; };
  assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => h.cache("catalog", load, options))), Array(10).fill("old"));
  assert.equal(loads, 0);
  assert.equal(h.background.length, 1);
  await h.background[0]!();
  assert.equal(await h.cache("catalog", load, options), "new");
  assert.equal(loads, 1);
});

test("a failed refresh never extends the lifetime of stale live status", async () => {
  const h = harness();
  await h.cache("live", async () => "live", options);
  await h.flush();
  h.advance(21_000);
  const fail = async (): Promise<string> => { throw new Error("provider down"); };
  assert.equal(await h.cache("live", fail, options), "live");
  await h.background[0]!();
  h.advance(40_000);
  await assert.rejects(h.cache("live", fail, options), /provider down/);
});

test("malformed or expired Redis snapshots are rebuilt", async () => {
  for (const value of [null, { value: 12, freshUntil: 120_000, staleUntil: 160_000 }, { value: "old", freshUntil: 1, staleUntil: 2 }]) {
    const h = harness();
    h.storage.set("catalog", value);
    assert.equal(await h.cache("catalog", async () => "fresh", options), "fresh");
  }
});

test("Redis outage falls back to memory, and failed loads can retry", async () => {
  let loads = 0;
  const cache = createPublicCache({
    read: async () => { throw new Error("offline"); },
    write: async () => { throw new Error("offline"); },
    background: (work) => { void work(); },
  });
  await assert.rejects(cache("key", async () => { throw new Error("failed"); }, options));
  const load = async () => { loads++; return "recovered"; };
  assert.equal(await cache("key", load, options), "recovered");
  assert.equal(await cache("key", load, options), "recovered");
  assert.equal(loads, 1);
});

test("empty degraded responses cannot poison a good snapshot", async () => {
  const h = harness();
  const nonempty = { ...options, shouldCache: (value: string) => value.length > 0 };
  await h.cache("catalog", async () => "good", nonempty);
  await h.flush();
  h.advance(21_000);
  assert.equal(await h.cache("catalog", async () => "", nonempty), "good");
  await h.background[0]!();
  assert.equal(await h.cache("catalog", async () => "", nonempty), "good");
});

test("cache keys isolate independent public resources", async () => {
  const h = harness();
  assert.equal(await h.cache("one", async () => "one", options), "one");
  assert.equal(await h.cache("two", async () => "two", options), "two");
});

test("a channel becoming live refreshes its archive sooner without losing warm fallback", async () => {
  const h = harness();
  const archive = { ...options, freshSeconds: 1800, staleSeconds: 21_600, shouldCache: (value: string) => value.length > 0 };
  await h.cache("twitch-channel", async () => "saved broadcasts", archive);
  await h.flush();
  h.advance(61_000);
  const active = { ...archive, freshSeconds: 60 };
  // A fresh process must also honor the live freshness policy from Redis.
  const replica = createPublicCache(h.dependencies);
  assert.equal(await replica("twitch-channel", async () => "", active), "saved broadcasts");
  assert.equal(h.background.length, 1);
  await h.background[0]!();
  assert.equal(await replica("twitch-channel", async () => "", active), "saved broadcasts");
  // A failed/empty provider refresh never turns six hours of stale fallback
  // into an unbounded archive. Keep the original offline snapshot's expiry.
  h.advance((1800 + 21_600 - 61) * 1000);
  assert.equal(await replica("twitch-channel", async () => "", active), "");
});

test("a cold response and warm hits never wait for Redis persistence", async () => {
  const h = harness();
  let finishWrite!: () => void;
  let writeStarted = false;
  const cache = createPublicCache({
    ...h.dependencies,
    write: async () => {
      writeStarted = true;
      await new Promise<void>((resolve) => { finishWrite = resolve; });
    },
  });
  assert.equal(await cache("catalog", async () => "ready", options), "ready");
  assert.equal(writeStarted, false, "serialization and transport start after the response");
  const persistence = h.background.shift()!();
  await Promise.resolve();
  assert.equal(writeStarted, true);
  assert.equal(await cache("catalog", async () => { throw new Error("must not load"); }, options), "ready");
  finishWrite();
  await persistence;
});

test("warm archive hits reuse validation only for the same snapshot and validator", async () => {
  const h = harness();
  let validations = 0;
  const policy = { ...options, validate: (value: unknown): value is string => {
    validations++;
    return typeof value === "string";
  } };
  await h.cache("catalog", async () => "ready", policy);
  for (let i = 0; i < 100; i++) await h.cache("catalog", async () => "unused", policy);
  assert.equal(validations, 1, "large catalogs are checked once, not scanned on every navigation");
  assert.equal(await h.cache("catalog", async () => "replacement", {
    ...policy, validate: (value): value is string => value === "replacement",
  }), "replacement", "a different validator must check the cached content again");
});

test("read deduplication cannot collide with a real key ending in :read", async () => {
  const h = harness();
  const result = await Promise.all([
    h.cache("catalog", async () => "main", options),
    h.cache("catalog:read", async () => "separate", options),
  ]);
  assert.deepEqual(result, ["main", "separate"]);
});

test("delayed persistence skips superseded snapshots and uses remaining lifetime", async () => {
  const h = harness();
  const writes: Array<{ value: unknown; ttl: number }> = [];
  const cache = createPublicCache({ ...h.dependencies,
    write: async (_key, value, ttl) => { writes.push({ value, ttl }); },
  });
  await cache("catalog", async () => "old", options);
  h.advance(61_000);
  await cache("catalog", async () => "new", options);
  h.advance(10_000);
  await h.flush();
  assert.equal(writes.length, 1);
  assert.equal((writes[0]!.value as { value: string }).value, "new");
  assert.equal(writes[0]!.ttl, 50);
});

test("an expired deferred snapshot is never persisted or resurrected", async () => {
  const h = harness();
  await h.cache("catalog", async () => "old", options);
  h.advance(60_000);
  await h.flush();
  assert.equal(h.storage.has("catalog"), false);
  assert.equal(await h.cache("catalog", async () => "new", options), "new");
});

test("overlapping writes finish in snapshot order without blocking readers", async () => {
  const h = harness();
  let finishFirst!: () => void;
  const written: unknown[] = [];
  const cache = createPublicCache({ ...h.dependencies,
    write: async (_key, entry) => {
      if (written.length === 0) await new Promise<void>((resolve) => { finishFirst = resolve; });
      written.push(entry);
    },
  });
  await cache("catalog", async () => "old", options);
  const first = h.background.shift()!();
  await Promise.resolve();
  h.advance(61_000);
  assert.equal(await cache("catalog", async () => "new", options), "new");
  const second = h.background.shift()!();
  finishFirst();
  await Promise.all([first, second]);
  assert.deepEqual(written.map((entry) => (entry as { value: string }).value), ["old", "new"]);
});

test("recently read snapshots survive capacity eviction", async () => {
  const h = harness();
  for (let i = 0; i < 64; i++) await h.cache(`channel-${i}`, async () => `value-${i}`, options);
  await h.flush();
  await h.cache("channel-0", async () => "unused", options);
  await h.cache("channel-64", async () => "value-64", options);
  const reads = h.reads();
  assert.equal(await h.cache("channel-0", async () => "unused", options), "value-0");
  assert.equal(h.reads(), reads, "hot snapshot remains in memory instead of requiring another Redis read");
  await h.cache("channel-1", async () => "unused", options);
  assert.equal(h.reads(), reads + 1, "least recently used snapshot is evicted");
});

test("a failed background scheduler cannot break a public response or pin refresh state", async () => {
  const h = harness();
  const cache = createPublicCache({ ...h.dependencies,
    background: () => { throw new Error("no request context"); },
  });
  assert.equal(await cache("catalog", async () => "old", options), "old");
  h.advance(21_000);
  assert.equal(await cache("catalog", async () => "new", options), "old");
  await Promise.resolve();
  assert.equal(await cache("catalog", async () => "unused", options), "new");
});
