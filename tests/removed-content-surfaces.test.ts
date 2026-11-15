import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { z } from "zod";
import { contentIdentityKeys, contentReferencesIncludingQuotes, isContentUnavailable, sanitizeAvailableContent, type ContentIdentityInput } from "../lib/content-identity";
import { catalogVisibilityItems, filterWatchCatalog, sanitizeWatchCatalog } from "../lib/watch/content-visibility";
import { resolveHomeItems } from "../lib/watch/home-catalog";
import { listAccountMatches } from "../lib/watch/list-account";
import { availabilityRequestItems, MAX_AVAILABILITY_IDENTITIES } from "../lib/watch/availability-request";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const removed: WatchItem = { id: "yt-abcdefghijk", platform: "youtube", kind: "youtube", title: "Removed title",
  poster: "", backdrop: "", memberSlug: "lacy", memberLabel: "Lacy", accent: "#fff", href: "/theater?kind=youtube&id=abcdefghijk",
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk" };
const kept: WatchItem = { ...removed, id: "yt-lmnopqrstuv", title: "Still available",
  href: "/theater?kind=youtube&id=lmnopqrstuv", sourceUrl: "https://youtu.be/lmnopqrstuv" };
const blocked = new Set(contentIdentityKeys(removed));
const available = async <T extends ContentIdentityInput>(items: readonly T[]) => sanitizeAvailableContent(items, blocked);

function fixture(): WatchCatalog {
  const items = [removed, kept];
  return { all: items, billboard: removed, live: items, house: items, videos: items, shorts: items,
    broadcasts: items, clips: items, photos: items, recent: items, heroFeatured: [removed],
    byMember: [{ slug: "lacy", label: "Lacy", accent: "", portrait: "", comm: "", items }],
    byPlatform: { youtube: items, twitch: [], x: [], tiktok: [], instagram: [], house: [] },
    programmingSections: [{ id: "curated", title: "Featured", layout: "standard", items }],
    liveCapabilities: { twitch: "supported", x: "unsupported", tiktok: "unsupported", instagram: "unsupported" }, fetchedAt: "2026-11-09T00:00:00Z" };
}

function load(file: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {} as Record<string, (...args: never[]) => unknown>;
  vm.runInNewContext(`(function(exports, require) { ${code}\n })`, { URL, Response, Set, Map })(api, (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return api;
}

test("a deletion overrides a stale catalog in every shelf, saved reference, and curated hero", () => {
  const stale = fixture();
  const filtered = filterWatchCatalog(stale, (item) => !isContentUnavailable(item, blocked));
  assert.equal(filtered.billboard, null);
  assert.ok(catalogVisibilityItems(filtered).every((item) => item.id === kept.id));
  assert.deepEqual(resolveHomeItems(filtered, [removed.id, "youtube:yt-abcdefghijk", "abcdefghijk"]), []);
  assert.equal(resolveHomeItems(filtered, [kept.id]).length, 1);
  assert.equal(stale.all.length, 2, "the reusable cache snapshot was not mutated");
});

test("a removed source also suppresses a saved alias with a different editorial ID", () => {
  const alias = { ...removed, id: "editorial-highlight", sourceUrl: "https://youtu.be/abcdefghijk?t=18" };
  assert.equal(isContentUnavailable(alias, blocked), true);
  for (const id of ["abcdefghijk", "yt-abcdefghijk", "youtube:yt-abcdefghijk"]) {
    assert.equal(isContentUnavailable({ id }, blocked), true, id);
  }
  assert.equal(isContentUnavailable(kept, blocked), false);
});

test("availability filtering preserves distinct editorial versions of the same provider item", () => {
  const stale = fixture();
  const curated = { ...kept, title: "Editorial feature", poster: "/curated.webp", captions: [{
    src: "https://media.example.test/captions.vtt", language: "en", label: "Editorial captions", kind: "captions" as const,
  }] };
  stale.billboard = curated;
  stale.heroFeatured = [curated];
  stale.programmingSections![0]!.items = [curated];
  const filtered = sanitizeWatchCatalog(stale, blocked);
  assert.equal(filtered.all[0], kept, "archive metadata must not be replaced by a same-ID hero override");
  assert.equal(filtered.billboard, curated);
  assert.equal(filtered.heroFeatured![0], curated);
  assert.equal(filtered.programmingSections![0]!.items[0], curated);
  assert.notEqual(filtered.all, stale.all, "page-local array operations cannot mutate the reusable cache");
  assert.equal(stale.all.length, 2);
});

test("sanitizing a removed DVR preserves per-variant metadata and shared references without mutating cache", () => {
  const live: WatchItem = { ...kept, id: "live-silky", kind: "live", platform: "twitch", sourceUrl: "https://www.twitch.tv/silky",
    href: "/theater?kind=live&login=silky", live: { login: "silky" }, dvr: { enabled: true, twitchVodId: "123456789" } };
  const curated = { ...live, title: "Curated live title", poster: "/curated-live.webp" };
  const stale = fixture();
  stale.all = [live]; stale.live = [live]; stale.billboard = curated; stale.heroFeatured = [curated];
  const keys = new Set(contentIdentityKeys({ provider: "twitch", providerId: "video:123456789" }));
  const filtered = sanitizeWatchCatalog(stale, keys);
  assert.equal(filtered.all[0]!.dvr, undefined);
  assert.equal(filtered.billboard!.dvr, undefined);
  assert.equal(filtered.billboard!.title, "Curated live title");
  assert.notEqual(filtered.billboard, filtered.all[0]);
  assert.equal(filtered.all[0], filtered.live[0]);
  assert.equal(filtered.billboard, filtered.heroFeatured![0]);
  assert.equal(stale.all[0]!.dvr!.twitchVodId, "123456789");
  assert.equal(stale.billboard!.dvr!.twitchVodId, "123456789");
});

test("a displayed X parent checks its removed quote even without a separate quoted card", () => {
  const parent = { id: "x-123456789", platform: "x", x: { statusId: "123456789",
    quote: { statusId: "987654321", statusUrl: "https://x.com/someone/status/987654321", text: "Removed quote" } } };
  const request = availabilityRequestItems([parent, parent]);
  assert.equal(request.length, 2, "parent and quote are deduplicated independently");
  const tombstones = new Set(contentIdentityKeys({ provider: "x", providerId: "987654321" }));
  const responseKeys = new Set(request.flatMap(contentIdentityKeys).filter((key) => tombstones.has(key)));
  const visible = sanitizeAvailableContent([parent], responseKeys);
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.x.quote, undefined);
  assert.ok(availabilityRequestItems(Array.from({ length: 2_000 }, (_, index) => ({ id: `x-${index + 1}`, platform: "x" }))).length <= MAX_AVAILABILITY_IDENTITIES);
});

test("saved-list reads, stale merges, and explicit saves respect the same local tombstone", async () => {
  const writes: unknown[][] = [];
  const refs = [removed.id, "abcdefghijk", kept.id];
  const api = load("../app/api/account/list/route.ts", {
    "next/server": { NextResponse: { json: Response.json } }, zod: { z },
    "@/lib/fan-auth": { getCurrentFanUserId: async () => "fan" },
    "@/lib/db": { query: async (sql: string, params: unknown[]) => {
      if (sql.includes("SELECT item_ref")) return { rows: refs.map((item_ref) => ({ item_ref })) };
      writes.push(params); return { rows: [] };
    } },
    "@/lib/oauth/schema": { ensureFanOauthSchema: async () => {} },
    "@/lib/subscriptions/entitlements": { requireAccountEntitlement: async () => {}, EntitlementDeniedError: class extends Error {} },
    "@/lib/watch/list-account": { listAccountMatches },
    "@/lib/watch/available-references": { filterAvailableReferences: async (ids: string[]) => (await available(ids.map((id) => ({ id })))).map(({ id }) => id) },
  }) as unknown as Record<"GET" | "POST" | "PUT", (request: Request) => Promise<Response>>;
  const get = await api.GET(new Request("https://core.test/api/account/list"));
  assert.deepEqual((await get.json()).ids, [kept.id]);
  await api.POST(new Request("https://core.test/api/account/list", { method: "POST", body: JSON.stringify({ ids: refs }) }));
  assert.deepEqual(Array.from(writes[0]?.[1] as string[]), [kept.id]);
  const result = await api.PUT(new Request("https://core.test/api/account/list", { method: "PUT", body: JSON.stringify({ id: removed.id, saved: true }) }));
  assert.equal(result.status, 410);
  assert.equal(writes.length, 1, "removed title never reaches the saved-list writer");
});

test("a removed saved snapshot is rejected before indexing or analyzer work", async () => {
  const calls: string[] = [];
  let claimed = false;
  const api = load("../lib/media-intelligence/ingest.ts", {
    "server-only": {}, "@/lib/content-availability": { filterAvailableContent: available },
    "@/lib/watch/catalog": {}, "./fingerprint": {}, "./jobs": {}, "./policy": {}, "./schema": {}, "./worker": {},
    "./analyzer": { getLocalMetadataAnalyzer: () => { calls.push("analyzer"); } },
    "./postgres-store": { getMediaIntelligenceStore: () => { claimed = true; return {}; } },
  }) as unknown as { indexWatchItem(item: WatchItem): Promise<string> };
  assert.equal(await api.indexWatchItem(removed), "skipped");
  assert.deepEqual(calls, []);
  assert.equal(claimed, false);
});

test("availability lookup is bounded and returns only local suppression keys", async () => {
  let lookups = 0;
  const api = load("../app/api/watch/availability/route.ts", {
    "next/server": { NextResponse: { json: Response.json } }, zod: { z },
    "@/lib/watch/available-references": { getUnavailableReferenceKeys: async (items: ContentIdentityInput[]) => {
      lookups += 1; return new Set(items.flatMap(contentIdentityKeys).filter((key) => blocked.has(key)));
    } },
  }) as unknown as { POST(request: Request): Promise<Response> };
  const response = await api.POST(new Request("https://core.test/api/watch/availability", { method: "POST", body: JSON.stringify({ items: [removed, kept] }) }));
  assert.equal(response.status, 200);
  assert.ok((await response.json()).unavailableKeys.length > 0);
  const oversized = await api.POST(new Request("https://core.test/api/watch/availability", { method: "POST", body: JSON.stringify({ items: Array(101).fill(kept) }) }));
  assert.equal(oversized.status, 400);
  assert.equal(lookups, 1);
});

for (const sharedPool of [true, false]) {
  test(`media writes retain the deletion lock through commit with ${sharedPool ? "one shared" : "separate"} database pool`, async () => {
    const calls: string[] = [];
    const primaryPool = {};
    let removedNow = false;
    const api = load("../lib/media-intelligence/content-guard.ts", {
      "server-only": {},
      "@/lib/content-identity": { isContentUnavailable, sanitizeAvailableContent, contentReferencesIncludingQuotes },
      "@/lib/content-availability": {
        lockContentReferences: async () => { calls.push("lock"); },
        getUnavailableContentKeys: async () => { calls.push("check"); return removedNow ? blocked : new Set(); },
      },
      "@/lib/db": { getPool: () => primaryPool,
        withTransaction: async (work: (client: object) => Promise<unknown>) => {
          calls.push("primary-begin"); const value = await work({}); calls.push("primary-commit"); return value;
        } },
      "./schema": { ensureMediaIntelligenceSchema: async () => {}, getMediaIntelligencePool: () => sharedPool ? primaryPool : {},
        withMediaIntelligenceTransaction: async (work: (client: object, capabilities: object) => Promise<unknown>) => {
          calls.push("media-begin"); const value = await work({}, {}); calls.push("media-commit"); return value;
        } },
    }) as unknown as { withAvailableMediaContent(item: ContentIdentityInput, work: () => Promise<void>): Promise<void> };
    await api.withAvailableMediaContent(removed, async () => { calls.push("write"); });
    assert.deepEqual(calls, sharedPool ? ["media-begin", "lock", "check", "write", "media-commit"]
      : ["primary-begin", "lock", "check", "media-begin", "write", "media-commit", "primary-commit"]);
    removedNow = true;
    calls.length = 0;
    await assert.rejects(api.withAvailableMediaContent(removed, async () => { calls.push("write"); }), /content_removed/);
    assert.equal(calls.includes("write"), false);
  });
}

test("stale parent quote JSON is sanitized under the deletion lock before asset and job writes", async () => {
  const parent = { id: "x-123456789", platform: "x", title: "The parent's own post", x: { statusId: "123456789",
    quote: { statusId: "987654321", statusUrl: "https://x.com/someone/status/987654321", text: "Deleted quote text" } } };
  const quoteKeys = new Set(contentIdentityKeys({ provider: "x", providerId: "987654321" }));
  const pool = {};
  let lockHeld = false;
  const writes: Array<{ kind: string; item: typeof parent }> = [];
  const client = { query: async (sql: string, values: unknown[]) => {
    assert.equal(lockHeld, true, "write and deletion share the active transaction lock");
    if (sql.includes("INSERT INTO media_intelligence_assets")) writes.push({ kind: "asset", item: JSON.parse(values[16] as string) });
    if (sql.includes("INSERT INTO media_intelligence_jobs")) writes.push({ kind: "job", item: JSON.parse(values[8] as string).analysisItem });
    return { rows: [], rowCount: 1 };
  } };
  const schema = { ensureMediaIntelligenceSchema: async () => {}, getMediaIntelligencePool: () => pool,
    withMediaIntelligenceTransaction: async (write: (client: object, capabilities: object) => Promise<unknown>) => {
      try { return await write(client, {}); } finally { lockHeld = false; }
    } };
  const guard = load("../lib/media-intelligence/content-guard.ts", {
    "server-only": {}, "./schema": schema, "@/lib/db": { getPool: () => pool },
    "@/lib/content-identity": { contentReferencesIncludingQuotes, sanitizeAvailableContent },
    "@/lib/content-availability": {
      lockContentReferences: async (_client: unknown, references: ContentIdentityInput[]) => {
        const keys = new Set(references.flatMap(contentIdentityKeys));
        assert.ok(keys.has("x:id:123456789"));
        assert.ok(keys.has("x:id:987654321"), "quoted source has its own deletion lock");
        lockHeld = true;
      },
      getUnavailableContentKeys: async () => { assert.equal(lockHeld, true); return quoteKeys; },
    },
  });
  const storeApi = load("../lib/media-intelligence/postgres-store.ts", {
    "server-only": {}, "./schema": schema, "./content-guard": guard,
  }) as unknown as { PostgresMediaIntelligenceStore: new () => { prepareRevision(asset: object, revision: object): Promise<void> } };
  await new storeApi.PostgresMediaIntelligenceStore().prepareRevision({ key: "x:x-123456789", item: parent }, { id: "revision" });
  const jobs = load("../lib/media-intelligence/jobs.ts", {
    "server-only": {}, "./schema": schema, "./content-guard": guard, "./azure": {},
  }) as unknown as { enqueueAnalysisJob(input: object): Promise<string> };
  await jobs.enqueueAnalysisJob({ assetKey: "x:x-123456789", analysisItem: parent, claim: {}, policy: {} });
  assert.deepEqual(writes.map(({ kind }) => kind), ["asset", "job"]);
  for (const { item } of writes) {
    assert.equal(item.title, parent.title);
    assert.equal(item.x.statusId, parent.x.statusId);
    assert.equal(item.x.quote, undefined);
  }
  assert.ok(parent.x.quote, "sanitizing does not mutate the caller's cached object");
});

for (const deleteFails of [false, true]) {
  test(`a removal during remote index upload ${deleteFails ? "re-arms durable cleanup on deletion failure" : "is deleted after upload"}`, async () => {
    let removedDuringUpload = false;
    let rearmed = false;
    const deleted: string[][] = [];
    const api = load("../lib/media-intelligence/indexing.ts", {
      "server-only": {},
      "@/lib/content-identity": { isContentUnavailable, sanitizeAvailableContent },
      "@/lib/content-availability": { getUnavailableContentKeys: async () => removedDuringUpload ? blocked : new Set() },
      "@/lib/db": { query: async (sql: string) => { assert.match(sql, /status='completed'/); rearmed = true; return { rows: [] }; } },
      "./fingerprint": { contentFingerprint: () => "generation" },
      "./embedding": { getEmbeddingProvider: () => ({ name: "local", model: "local" }) },
      "./postgres-store": { getMediaIntelligenceStore: () => ({ searchDocuments: async () => [{ asset: { key: "youtube:yt-abcdefghijk", item: removed } }] }) },
      "./azure": { readAzureMediaConfig: () => ({ aiSearch: { indexName: "test" }, requested: true }),
        getAzureMediaAdapters: () => ({ aiSearch: { name: "test", publishGeneration: async () => {
          removedDuringUpload = true; return { documentCount: 1 };
        }, deleteDocuments: async (keys: string[]) => {
          deleted.push(keys); if (deleteFails) throw new Error("remote_delete_failed");
        } } }) },
      "./schema": { mediaIntelligenceQuery: async () => ({ rows: [] }),
        withMediaIntelligenceTransaction: async (work: (client: object) => Promise<unknown>) => work({ query: async () => ({ rows: [] }) }) },
    }) as unknown as { publishMediaIndexGeneration(): Promise<unknown> };
    if (deleteFails) await assert.rejects(api.publishMediaIndexGeneration(), /remote_delete_failed/);
    else await api.publishMediaIndexGeneration();
    assert.deepEqual(deleted.map((keys) => Array.from(keys)), [["youtube:yt-abcdefghijk"]]);
    assert.equal(rearmed, deleteFails);
  });
}

test("saved local clip UUIDs resolve their provider tombstone without dropping unknown references", async () => {
  const uuid = "a1234567-1234-4321-abcd-a12345678901";
  const localRef = `clip-${uuid}`;
  const api = load("../lib/watch/available-references.ts", {
    "server-only": {},
    "@/lib/content-identity": { contentIdentityKeys, isContentUnavailable },
    "@/lib/content-availability": { getUnavailableContentKeys: async () => new Set(blocked) },
    "@/lib/db": { query: async (_sql: string, params: string[][]) => {
      assert.deepEqual(Array.from(params[0]!), [uuid]);
      return { rows: [{ id: uuid, source: "youtube", external_id: "abcdefghijk", url: removed.sourceUrl }] };
    } },
  }) as unknown as { filterAvailableReferences(refs: string[]): Promise<string[]>; getUnavailableReferenceKeys(items: ContentIdentityInput[]): Promise<Set<string>> };
  assert.deepEqual(Array.from(await api.filterAvailableReferences([localRef, kept.id, "unknown-reference"])), [kept.id, "unknown-reference"]);
  assert.equal(isContentUnavailable({ id: localRef }, await api.getUnavailableReferenceKeys([{ id: localRef }])), true);
});
