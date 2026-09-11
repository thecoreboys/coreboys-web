import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import type { createPassportWatchCatalogRegistrar } from "../lib/passport/watch-registry";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

// Inject transactions without opening database or Redis connections.
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
type Asset = { playbackRef: string; aliases: string[]; durationSeconds: number; kind: string };

function database() {
  let now = 1_000;
  let rows = new Map<string, { asset: Asset; lastSeen: number }>();
  let state: Record<string, unknown> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let active = 0;
  let maxActive = 0;
  let failBatch: number | null = null;
  let failCommit = false;
  const batches: Asset[][] = [];
  const transaction: Parameters<typeof registrar>[0]["transaction"] = (run) => {
    const result = queue.then(async () => {
      const oldRows = new Map(rows);
      const oldState = state;
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        const count = await run(async (sql, values) => {
          await Promise.resolve();
          if (sql.startsWith("SELECT fingerprint")) return { rowCount: state ? 1 : 0, rows: state ? [state] : [] };
          if (sql.startsWith("INSERT INTO passport_watch_registry_state")) {
            state = { fingerprint: values[0], archive_confirmed_at: values[1], live_confirmed_at: values[2] };
            return { rowCount: 1 };
          }
          assert.ok(sql.startsWith("WITH assets AS"));
          const batch = JSON.parse(String(values[0])) as Asset[];
          batches.push(batch);
          if (batches.length === failBatch) { failBatch = null; throw new Error("batch failed"); }
          let changed = 0;
          for (const asset of batch) {
            const previous = rows.get(asset.playbackRef);
            const interval = asset.kind === "live" ? 5 * 60_000 : 24 * 60 * 60_000;
            if (!previous || JSON.stringify(previous.asset) !== JSON.stringify(asset) || now - previous.lastSeen >= interval) {
              rows.set(asset.playbackRef, { asset, lastSeen: now });
              changed++;
            }
          }
          return { rowCount: changed };
        });
        if (failCommit) { failCommit = false; throw new Error("commit failed"); }
        return count;
      } catch (error) {
        rows = oldRows;
        state = oldState;
        throw error;
      } finally { active--; }
    });
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    register: () => registrar({ transaction, now: () => now }), batches,
    advance: (milliseconds: number) => { now += milliseconds; },
    row: (ref: string) => rows.get(ref)?.asset,
    size: () => rows.size, state: () => state, maxActive: () => maxActive,
    failBatch: (number: number) => { failBatch = number; },
    failCommit: () => { failCommit = true; },
  };
}

test("large catalogs compare bounded batches and unchanged generations perform no asset writes", async () => {
  const db = database();
  const register = db.register();
  const all = Array.from({ length: 2_503 }, (_, index) => item(`video-${index}`));
  assert.equal(await register(catalog(all)), 2_503);
  assert.deepEqual(db.batches.map((batch) => batch.length), [1_000, 1_000, 503]);
  assert.equal(db.size(), all.length);
  assert.equal(await register(catalog(all.map((entry) => ({ ...entry, title: "New title", poster: "/new.jpg" })))), 0);
  assert.equal(db.batches.length, 3);
  const updated = all.map((entry, index) => index === 0 ? { ...entry, durationSeconds: 900 } : entry);
  updated.push(item("new-video"));
  assert.equal(await register(catalog(updated)), 2, "new generations compare every row but only changed rows update");
  assert.deepEqual(db.batches.slice(3).map((batch) => batch.length), [1_000, 1_000, 504]);
});

test("replicas reuse the durable generation independently of Redis or local fingerprints", async () => {
  const db = database();
  const all = [item("one"), item("two")];
  assert.equal(await db.register()(catalog(all)), 2);
  assert.equal(await db.register()(catalog([...all].reverse())), 0);
  assert.equal(db.batches.length, 1);
  assert.equal(await database().register()(catalog(all)), 2, "another database cannot reuse the acknowledgment");
  db.advance(24 * 60 * 60_000);
  assert.equal(await db.register()(catalog(all)), 2);
});

test("live renewals retain the separate daily archive clock", async () => {
  const db = database();
  const all = catalog([item("archive"), item("live", { id: "live-creator", platform: "twitch", kind: "live", live: { login: "creator" } })]);
  assert.equal(await db.register()(all), 2);
  db.advance(4 * 60_000);
  assert.equal(await db.register()(all), 0);
  db.advance(60_000);
  assert.equal(await db.register()(all), 1);
  assert.deepEqual(db.batches[1]!.map((asset) => asset.playbackRef), ["twitch:live-creator"]);
  db.advance(24 * 60 * 60_000 - 5 * 60_000);
  assert.equal(await db.register()(all), 2);
});

test("A/B/A/C replicas cannot certify metadata changed by another instance", async () => {
  const db = database();
  const a = db.register(), b = db.register(), c = db.register();
  const original = catalog([item("one"), item("two")]);
  await a(original);
  assert.equal(await b(catalog([item("one", { durationSeconds: 900 }), item("two")])), 1);
  const next = catalog([item("one"), item("two"), item("three")]);
  assert.equal(await a(next), 2, "A must reconcile B's change as well as its new asset");
  assert.equal(db.row("youtube:one")?.durationSeconds, 600);
  assert.equal(await c(next), 0);
  assert.equal(db.row("youtube:one")?.durationSeconds, 600);
});

test("an unchanged local snapshot cannot bypass another instance's durable generation", async () => {
  const db = database();
  const a = db.register(), b = db.register();
  const original = catalog([item("one")]);
  await a(original);
  await b(catalog([item("one", { durationSeconds: 900 })]));
  assert.equal(await a(original), 1);
  assert.equal(db.row("youtube:one")?.durationSeconds, 600);
});

test("a failed batch rolls back earlier batches and the acknowledgment", async () => {
  const db = database();
  const register = db.register();
  const all = catalog(Array.from({ length: 2_001 }, (_, index) => item(`retry-${index}`)));
  db.failBatch(2);
  await assert.rejects(register(all), /batch failed/);
  assert.equal(db.size(), 0);
  assert.equal(db.state(), null);
  assert.equal(await register(all), 2_001);
  assert.equal(db.size(), 2_001);
});

test("commit failure cannot acknowledge uncommitted metadata", async () => {
  const db = database();
  const original = catalog([item("one")]);
  await db.register()(original);
  const oldState = db.state();
  db.failCommit();
  const updated = catalog([item("one", { durationSeconds: 900 })]);
  await assert.rejects(db.register()(updated), /commit failed/);
  assert.equal(db.state(), oldState);
  assert.equal(db.row("youtube:one")?.durationSeconds, 600);
  assert.equal(await db.register()(updated), 1);
  assert.equal(db.row("youtube:one")?.durationSeconds, 900);
});

test("concurrent replicas serialize full multi-batch generations", async () => {
  const db = database();
  const all = Array.from({ length: 1_001 }, (_, index) => item(`concurrent-${index}`));
  const updated = all.map((entry) => ({ ...entry, durationSeconds: 900 }));
  assert.deepEqual(await Promise.all([db.register()(catalog(all)), db.register()(catalog(updated))]), [1_001, 1_001]);
  assert.equal(db.maxActive(), 1);
  assert.equal(db.row("youtube:concurrent-0")?.durationSeconds, 900);
  assert.equal(db.row("youtube:concurrent-1000")?.durationSeconds, 900);
  assert.equal(await db.register()(catalog(updated)), 0);
});

test("all current aliases remain registered while non-playable cards are excluded", async () => {
  const db = database();
  assert.equal(await db.register()(catalog([
    item("same", { sourceUrl: "https://youtube.com/watch?v=same" }),
    item("same", { sourceUrl: "https://youtu.be/same" }),
    item("photo", { format: "photo" }), item("post", { kind: "post" }), item("blocked", { embeddable: false }),
    item("live", { id: "live-creator", platform: "twitch", kind: "live", live: { login: "creator" } }),
  ])), 2);
  assert.ok(db.row("youtube:same")?.aliases.includes("https://youtube.com/watch?v=same"));
  assert.ok(db.row("youtube:same")?.aliases.includes("https://youtu.be/same"));
  assert.ok(db.row("twitch:live-creator")?.aliases.includes("twitch:stream:creator"));
});
