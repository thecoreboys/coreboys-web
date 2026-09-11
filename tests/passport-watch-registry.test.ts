import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import type { createPassportWatchCatalogRegistrar } from "../lib/passport/watch-registry";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

// Exercise the server implementation with an injected database/cache, without
// loading React's client-only marker or contacting either external service.
const requireModule = createRequire(resolve(process.cwd(), "package.json"));
const markerPath = requireModule.resolve("server-only");
const previousMarker = requireModule.cache[markerPath];
requireModule.cache[markerPath] = { id: markerPath, filename: markerPath, loaded: true, exports: {} } as NodeJS.Module;
const { createPassportWatchCatalogRegistrar: registrar } = requireModule("./lib/passport/watch-registry") as { createPassportWatchCatalogRegistrar: typeof createPassportWatchCatalogRegistrar };
if (previousMarker) requireModule.cache[markerPath] = previousMarker;
else delete requireModule.cache[markerPath];

const item = (id: string, patch: Partial<WatchItem> = {}): WatchItem => ({
  id: `yt-${id}`, kind: "youtube", platform: "youtube", title: id, poster: "/poster.jpg", backdrop: "/poster.jpg",
  memberSlug: "core", memberLabel: "CORE", accent: "#fff", href: `/theater?id=${id}`, sourceUrl: `https://youtube.com/watch?v=${id}`,
  durationSeconds: 600, ...patch,
});
const catalog = (all: WatchItem[]) => ({ all }) as WatchCatalog;
const readBatch = (values: ReadonlyArray<unknown>) => JSON.parse(String(values[0])) as Array<{ playbackRef: string; aliases: string[]; durationSeconds: number }>;

test("large catalogs register every asset in bounded batches and unchanged refreshes perform no writes", async () => {
  const batches: ReturnType<typeof readBatch>[] = [];
  const register = registrar({ execute: async (_sql, values) => { const batch = readBatch(values); batches.push(batch); return { rowCount: batch.length }; } });
  const all = Array.from({ length: 2_503 }, (_, index) => item(`video-${index}`));
  assert.equal(await register(catalog(all)), 2_503);
  assert.deepEqual(batches.map((batch) => batch.length), [1_000, 1_000, 503]);
  assert.equal(new Set(batches.flat().map((asset) => asset.playbackRef)).size, all.length);
  assert.equal(await register(catalog(all.map((entry) => ({ ...entry, title: "New title", poster: "/new.jpg" })))), 0);
  assert.equal(batches.length, 3);
  const updated = all.map((entry, index) => index === 0 ? { ...entry, durationSeconds: 900 } : entry);
  updated.push(item("new-video"));
  assert.equal(await register(catalog(updated)), 2);
  assert.equal(batches[3]!.length, 2);
});

test("success markers skip unchanged catalog writes on another replica, scoped to its database", async () => {
  let writes = 0;
  let now = 100_000;
  const markers = new Map<string, unknown>();
  const dependencies = {
    execute: async (_sql: string, values: ReadonlyArray<unknown>) => { writes += 1; return { rowCount: readBatch(values).length }; },
    readMarker: async (key: string) => markers.get(key),
    writeMarker: async (key: string, value: unknown) => { markers.set(key, value); },
    now: () => now,
  };
  const first = registrar({ ...dependencies, namespace: "database-a" });
  const second = registrar({ ...dependencies, namespace: "database-a" });
  const all = [item("one"), item("two")];
  assert.equal(await first(catalog(all)), 2);
  assert.equal(await second(catalog([...all].reverse())), 0);
  assert.equal(writes, 1);
  assert.equal(await registrar({ ...dependencies, namespace: "database-b" })(catalog(all)), 2);
  assert.equal(writes, 2);
  now += 24 * 60 * 60 * 1_000;
  assert.equal(await second(catalog(all)), 2, "renew before the 90-day eligibility window expires");
});

test("new assets cannot indefinitely renew an older archive's cache acknowledgment", async () => {
  let now = 1_000;
  const markers = new Map<string, unknown>();
  const dependencies = {
    execute: async (_sql: string, values: ReadonlyArray<unknown>) => ({ rowCount: readBatch(values).length }),
    readMarker: async (key: string) => markers.get(key),
    writeMarker: async (key: string, value: unknown) => { markers.set(key, value); },
    now: () => now,
  };
  const register = registrar(dependencies);
  await register(catalog([item("old")]));
  now += 23 * 60 * 60 * 1_000;
  const all = [item("old"), item("new")];
  assert.equal(await register(catalog(all)), 1);
  now += 2 * 60 * 60 * 1_000;
  assert.equal(await registrar(dependencies)(catalog(all)), 2, "old marker must expire despite the new asset");
});

test("live eligibility renews every five minutes without resending unchanged archive assets", async () => {
  let now = 1_000;
  const batches: ReturnType<typeof readBatch>[] = [];
  const register = registrar({
    execute: async (_sql, values) => { const batch = readBatch(values); batches.push(batch); return { rowCount: batch.length }; },
    now: () => now,
  });
  const all = catalog([item("archive"), item("live", { id: "live-creator", platform: "twitch", kind: "live", live: { login: "creator" } })]);
  assert.equal(await register(all), 2);
  now += 4 * 60 * 1_000;
  assert.equal(await register(all), 0);
  now += 60 * 1_000;
  assert.equal(await register(all), 1);
  assert.equal(batches[1]![0]!.playbackRef, "twitch:live-creator");
});

test("reverting metadata cannot reuse an obsolete successful catalog marker", async () => {
  const markers = new Map<string, unknown>();
  const register = registrar({
    execute: async (_sql, values) => ({ rowCount: readBatch(values).length }),
    readMarker: async (key) => markers.get(key),
    writeMarker: async (key, value) => { markers.set(key, value); },
  });
  const original = catalog([item("one")]);
  assert.equal(await register(original), 1);
  assert.equal(await register(catalog([item("one", { durationSeconds: 900 })])), 1);
  assert.equal(await register(original), 1);
  assert.equal(markers.size, 1);
});

test("a failed batch cannot acknowledge missing assets; retry persists the remaining assets", async () => {
  const batches: ReturnType<typeof readBatch>[] = [];
  let fail = true;
  let markerWrites = 0;
  const register = registrar({
    execute: async (_sql, values) => {
      const batch = readBatch(values);
      if (batches.length === 1 && fail) { fail = false; throw new Error("database unavailable"); }
      batches.push(batch);
      return { rowCount: batch.length };
    },
    writeMarker: async () => { markerWrites += 1; },
  });
  const all = catalog(Array.from({ length: 2_001 }, (_, index) => item(`retry-${index}`)));
  await assert.rejects(register(all), /database unavailable/);
  assert.equal(markerWrites, 0);
  assert.equal(await register(all), 1_001);
  assert.equal(markerWrites, 1);
  assert.equal(new Set(batches.flat().map((asset) => asset.playbackRef)).size, 2_001);
});

test("overlapping refreshes serialize; cache outages preserve database registration", async () => {
  let writes = 0;
  const register = registrar({
    execute: async (_sql, values) => { writes += 1; return { rowCount: readBatch(values).length }; },
    readMarker: async () => { throw new Error("cache unavailable"); },
    writeMarker: async () => { throw new Error("cache unavailable"); },
  });
  const all = catalog([item("one")]);
  assert.deepEqual(await Promise.all([register(all), register(all)]), [1, 0]);
  assert.equal(writes, 1);
});

test("all current aliases remain registered while non-playable cards are excluded", async () => {
  let registered: ReturnType<typeof readBatch> = [];
  const register = registrar({ execute: async (_sql, values) => { registered = readBatch(values); return { rowCount: registered.length }; } });
  assert.equal(await register(catalog([
    item("same", { sourceUrl: "https://youtube.com/watch?v=same" }),
    item("same", { sourceUrl: "https://youtu.be/same" }),
    item("photo", { format: "photo" }), item("post", { kind: "post" }), item("blocked", { embeddable: false }),
    item("live", { id: "live-creator", platform: "twitch", kind: "live", live: { login: "creator" } }),
  ])), 2);
  assert.ok(registered[0]!.aliases.includes("https://youtube.com/watch?v=same"));
  assert.ok(registered[0]!.aliases.includes("https://youtu.be/same"));
  assert.ok(registered[1]!.aliases.includes("twitch:stream:creator"));
});
