import test from "node:test";
import assert from "node:assert/strict";
import { createPublicCache } from "../lib/public-cache";

const options = { freshSeconds: 20, staleSeconds: 40, validate: (value: unknown): value is string => typeof value === "string" };

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
  const replica = createPublicCache(h.dependencies);
  assert.equal(await replica("catalog", async () => { throw new Error("must not load"); }, options), "shared");
});

test("stale data returns immediately and queues only one background refresh", async () => {
  const h = harness();
  await h.cache("catalog", async () => "old", options);
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
    background: () => {},
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
