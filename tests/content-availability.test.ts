import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as identity from "../lib/content-identity";
import * as normalization from "../lib/social-event-normalization";
import type { ContentRemovalInput } from "../lib/content-availability";
import type { SocialEventInput } from "../lib/social-events";

const nodeRequire = createRequire(import.meta.url);
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const post = { platform: "x", id: "x-123456789-photo-1", sourceUrl: "https://twitter.com/core/status/123456789/photo/1", title: "A post" };
const removal: ContentRemovalInput = { provider: "x", providerId: "123456789", reason: "deleted", evidence: "provider_webhook" };

test("identity joins X media cards, usernames and Twitter/X aliases without conflating another post", () => {
  const unavailable = new Set(identity.contentIdentityKeys(removal));
  assert.equal(identity.isContentUnavailable(post, unavailable), true);
  assert.equal(identity.isContentUnavailable({ id: "x:x-123456789-video-2" }, unavailable), true);
  assert.equal(identity.isContentUnavailable({ platform: "x", id: "x-123456780" }, unavailable), false);
  assert.equal(identity.isContentUnavailable({ platform: "youtube", id: "12345678901" }, unavailable), false);
});

test("legacy saved references and provider permalinks normalize across supported sources", () => {
  const fixtures = [
    [{ provider: "youtube", providerId: "AbC123def_-" }, [{ id: "youtube:yt-AbC123def_-" }, { id: "AbC123def_-" }, { url: "https://youtu.be/AbC123def_-?t=15" }]],
    [{ provider: "tiktok", providerId: "1234567890123" }, [{ id: "tiktok:tt-1234567890123" }, { url: "https://www.tiktok.com/@crew/video/1234567890123" }]],
    [{ provider: "instagram", providerId: "179111111", sourceUrl: "https://www.instagram.com/reel/AbCd_Ef/" }, [{ id: "ig-179111111" }, { url: "https://instagram.com/p/AbCd_Ef/?igsh=tracking" }]],
    [{ provider: "twitch", providerId: "12345678" }, [{ id: "twitch:vod-12345678" }, { url: "https://www.twitch.tv/videos/12345678?t=1h" }]],
    [{ provider: "twitch", providerId: "clip:SomeClip" }, [{ id: "clip-SomeClip" }, { id: "clip-twitch-SomeClip" }, { url: "https://clips.twitch.tv/SomeClip" }]],
  ] as const;
  for (const [removed, aliases] of fixtures) for (const alias of aliases) {
    assert.equal(identity.isContentUnavailable(alias, new Set(identity.contentIdentityKeys(removed))), true, JSON.stringify(alias));
  }
  assert.equal(identity.isContentUnavailable({ id: "clip-youtube-AbC123def_-" }, new Set(identity.contentIdentityKeys({ provider: "youtube", providerId: "AbC123def_-" }))), true);
});

test("internal, CDN, hostile lookalike and account URLs never become content identities", () => {
  for (const sourceUrl of ["https://evil.example/x.com/i/status/1234", "https://x.com.evil.example/i/status/1234", "https://pbs.twimg.com/media/image.jpg", "https://x.com/core", "/theater/x-1234", "javascript:alert(1)"]) {
    assert.deepEqual(identity.contentIdentityKeys({ sourceUrl }), []);
  }
  assert.deepEqual(identity.contentIdentityKeys({ platform: "house", id: "yt-AbC123def_-" }), []);
  assert.equal(identity.isContentUnavailable({ platform: "house", id: "house-tour", sourceUrl: "https://www.youtube.com/watch?v=AbC123def_-" },
    new Set(identity.contentIdentityKeys({ provider: "youtube", providerId: "AbC123def_-" }))), true);
  assert.equal(identity.isContentUnavailable({ platform: "instagram", id: "ig-ABC" }, new Set(["instagram:id:abc"])), false);
});

test("deleted quote text and artwork are removed without hiding or mutating its public parent", () => {
  const parent = { ...post, id: "x-987654321", sourceUrl: "https://x.com/core/status/987654321", x: {
    statusId: "987654321", quote: { statusId: "123456789", statusUrl: "https://x.com/crew/status/123456789", text: "Deleted private words", media: [{ thumbnailUrl: "https://cdn.example/photo.jpg" }] },
    quoteReference: { statusId: "123456789", statusUrl: "https://x.com/crew/status/123456789" },
  } };
  const result = identity.sanitizeAvailableContent([parent], new Set(identity.contentIdentityKeys(removal)));
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, parent.title);
  assert.equal(result[0]?.x.quote, undefined);
  assert.equal(result[0]?.x.quoteReference, undefined);
  assert.ok(parent.x.quote.text);
});

test("a deleted growing VOD removes rewind while preserving the live channel", () => {
  const live = { platform: "twitch", id: "live-core", sourceUrl: "https://www.twitch.tv/core", dvr: { enabled: true, twitchVodId: "12345678", windowSeconds: 60 } };
  const keys = new Set(identity.contentIdentityKeys({ provider: "twitch", providerId: "video:12345678" }));
  const result = identity.sanitizeAvailableContent([live], keys);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "live-core");
  assert.equal(result[0]?.dvr, undefined);
  assert.ok(live.dvr.enabled);
  assert.equal(identity.contentReferencesIncludingQuotes(live).some((reference) => identity.isContentUnavailable(reference, keys)), true);
});

function fixture() {
  const keys = new Set<string>();
  const jobs = new Map<string, { id: string; reference: ContentRemovalInput; content_keys: string[]; related_asset_keys?: string[]; status: string }>();
  const events = new Map<string, { id: string; canonical_id: string; member_slug: string | null; content_type: string; published_at: string; notification_eligible: boolean; removed_at: string | null; payload: unknown }>();
  const deliveries: Array<{ eventId: string; status: string }> = [];
  const locks = new Map<string, Promise<void>>();
  const traces: string[] = [];
  let failReads = false;
  let failCleanup = false;
  let failRemote = false;
  let parentHasQuote = true;
  const cleaned: string[] = [];
  const remoteDeleted: string[] = [];
  let mediaAssets: Array<{ asset_key: string; platform: string; external_id: string; source_url: string | null; item: identity.ContentIdentityInput | null }> = [
    { asset_key: "x:x-123456789", platform: "x", external_id: "x-123456789", source_url: post.sourceUrl, item: post },
  ];
  async function sql(statement: string, params: unknown[] = []) {
    traces.push(statement);
    if (statement.startsWith("SELECT content_key")) {
      if (failReads) throw new Error("database unavailable");
      return { rows: (params[0] as string[]).filter((key) => keys.has(key)).map((content_key) => ({ content_key })) };
    }
    if (statement.includes("INSERT INTO content_tombstones")) {
      for (const key of params[0] as string[]) keys.add(key);
      return { rows: [] };
    }
    if (statement.includes("UPDATE social_content_events SET removed_at")) {
      const matches = [...events.values()].filter((event) => (params[1] as string[]).includes(event.canonical_id));
      for (const event of matches) { event.removed_at = String(params[3]); event.notification_eligible = false; }
      return { rows: matches.map(({ id }) => ({ id })) };
    }
    if (statement.includes("UPDATE social_notification_deliveries SET status='suppressed'")) {
      for (const delivery of deliveries) if ((params[0] as string[]).includes(delivery.eventId)) delivery.status = "suppressed";
      return { rows: [] };
    }
    if (statement.includes("INSERT INTO content_removal_cleanup")) {
      const id = String(params[0]);
      if (!jobs.has(id)) jobs.set(id, { id, reference: JSON.parse(String(params[1])), content_keys: params[2] as string[], status: "pending" });
      return { rows: [] };
    }
    if (statement.includes("UPDATE content_removal_cleanup SET status='processing'")) {
      const ready = [...jobs.values()].filter((job) => job.status === "pending");
      ready.forEach((job) => { job.status = "processing"; });
      return { rows: ready };
    }
    if (statement.includes("UPDATE content_removal_cleanup SET status='completed'")) { jobs.get(String(params[0]))!.status = "completed"; return { rows: [] }; }
    if (statement.includes("UPDATE content_removal_cleanup SET status='pending'")) { jobs.get(String(params[0]))!.status = "pending"; return { rows: [] }; }
    if (statement.includes("UPDATE content_removal_cleanup SET related_asset_keys=")) { jobs.get(String(params[0]))!.related_asset_keys = params[1] as string[]; return { rows: [] }; }
    if (statement.includes("INSERT INTO social_content_events")) {
      const key = String(params[3]);
      if (events.has(key)) return { rows: [] };
      const event = { id: `event-${events.size}`, canonical_id: key, member_slug: params[1] as string | null, content_type: String(params[2]), published_at: String(params[10]), notification_eligible: Boolean(params[11]), removed_at: null, payload: JSON.parse(String(params[9])) };
      events.set(key, event);
      return { rows: [{ ...event, created: true }] };
    }
    if (statement.includes("FROM social_content_events WHERE canonical_id=")) return { rows: [events.get(String(params[0]))].filter(Boolean) };
    if (statement.includes("INSERT INTO social_notification_deliveries")) { deliveries.push({ eventId: String(params[0]), status: "pending" }); return { rows: [] }; }
    return { rows: [] };
  }
  async function withTransaction<T>(work: (client: { query: typeof sql }) => Promise<T>) {
    const release: Array<() => void> = [];
    const client = { query: async (statement: string, params: unknown[] = []) => {
      if (statement.startsWith("SELECT pg_advisory_xact_lock")) {
        const key = String(params[0]);
        const previous = locks.get(key) ?? Promise.resolve();
        let unlock!: () => void;
        const gate = new Promise<void>((resolve) => { unlock = resolve; });
        locks.set(key, previous.then(() => gate));
        await previous;
        release.push(unlock);
        traces.push(`lock:${key}`);
        return { rows: [] };
      }
      return sql(statement, params);
    } };
    try { return await work(client); } finally { release.reverse().forEach((unlock) => unlock()); }
  }
  const modules = new Map<string, unknown>();
  function load(relative: string) {
    const filename = path.resolve(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, URL, Buffer, console, process, require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "next/cache") return { revalidateTag: () => {} };
      if (name === "@/lib/db") return { query: sql, withTransaction };
      if (name === "./content-identity" || name === "@/lib/content-identity") return identity;
      if (name === "@/lib/social-event-normalization") return normalization;
      if (name === "@/lib/content-availability") return modules.get("availability");
      if (name === "@/lib/x-feed-snapshot") return { purgeRemovedXFeedSnapshotItems: async () => {} };
      if (name === "@/lib/media-intelligence/schema") return { mediaIntelligenceQuery: async (sql: string) => {
        if (failCleanup) throw new Error("search offline");
        if (sql.includes("SELECT asset_key") && sql.includes("{x,quote,statusId}")) return { rows: parentHasQuote ? [{ asset_key: "x:x-parent" }] : [] };
        if (sql.includes("UPDATE media_intelligence_assets SET item=")) { parentHasQuote = false; return { rows: [] }; }
        return { rows: mediaAssets };
      } };
      if (name === "@/lib/media-intelligence/retention") return { tombstoneMediaAsset: async ({ assetKey }: { assetKey: string }) => { cleaned.push(assetKey); } };
      if (name === "@/lib/media-intelligence/azure") return { getAzureMediaAdapters: () => ({ aiSearch: { deleteDocuments: async (ids: string[]) => {
        if (failRemote) throw new Error("remote search offline");
        remoteDeleted.push(...ids);
      } } }) };
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected dependency ${name}`);
    } }, { filename });
    return module.exports;
  }
  const availability = load("lib/content-availability.ts") as typeof import("../lib/content-availability");
  modules.set("availability", availability);
  const social = load("lib/social-events.ts") as typeof import("../lib/social-events");
  return { availability, social, keys, jobs, events, deliveries, traces, cleaned, remoteDeleted,
    setFailReads: (value: boolean) => { failReads = value; }, setFailCleanup: (value: boolean) => { failCleanup = value; },
    setFailRemote: (value: boolean) => { failRemote = value; }, parentHasQuote: () => parentHasQuote,
    setMediaAssets: (rows: typeof mediaAssets) => { mediaAssets = rows; } };
}

const event = (): SocialEventInput => ({ provider: "x", canonicalId: "x:123456789", href: "https://x.com/core/status/123456789", memberSlug: null, contentType: "post", title: "Removed soon", publishedAt: new Date().toISOString(), notify: true });

test("durable removal is idempotent, suppresses existing deliveries, and blocks stale imports", async () => {
  const f = fixture();
  await f.social.recordSocialEvent(event());
  assert.equal(f.deliveries.length, 3);
  await f.availability.recordContentRemoval(removal);
  await f.availability.recordContentRemoval(removal);
  assert.equal(f.keys.size, 1);
  assert.equal(f.jobs.size, 1);
  assert.ok(f.events.get("x:123456789")?.removed_at);
  assert.ok(f.deliveries.every((delivery) => delivery.status === "suppressed"));
  assert.deepEqual(plain(await f.social.recordSocialEvent(event())), { id: null, created: false, suppressed: true });
  assert.equal(f.deliveries.length, 3);
  assert.deepEqual(await f.availability.filterAvailableContent([post]), []);
  assert.ok(f.traces.some((trace) => trace.startsWith("DELETE FROM fan_inbox_notifications")));
});

test("racing post creation and removal serialize on the same canonical identity", async () => {
  for (const removalFirst of [false, true]) {
    const f = fixture();
    const operations = removalFirst
      ? [f.availability.recordContentRemoval(removal), f.social.recordSocialEvent(event())]
      : [f.social.recordSocialEvent(event()), f.availability.recordContentRemoval(removal)];
    await Promise.all(operations);
    assert.deepEqual(await f.availability.filterAvailableContent([post]), []);
    assert.ok([...f.events.values()].every((entry) => entry.removed_at));
    assert.ok(f.deliveries.every((entry) => entry.status === "suppressed"));
  }
});

test("transient errors and list absence are rejected as deletion evidence", async () => {
  const f = fixture();
  for (const reason of ["timeout", "rate_limit", "auth_failure", "missing_from_page", "error"]) {
    await assert.rejects(f.availability.recordContentRemoval({ ...removal, reason } as ContentRemovalInput), /invalid_content_removal_evidence/);
  }
  await assert.rejects(f.availability.recordContentRemoval({ ...removal, providerId: undefined, url: "https://x.com/core" }), /identity/);
  assert.equal(f.keys.size, 0);
  assert.equal(f.jobs.size, 0);
});

test("availability reads do not treat database failure as permission to expose cached content", async () => {
  const f = fixture();
  f.setFailReads(true);
  await assert.rejects(f.availability.filterAvailableContent([post]), /database unavailable/);
});

test("background cleanup retries failures while the authoritative public filter stays closed", async () => {
  const f = fixture();
  await f.availability.recordContentRemoval(removal);
  f.setFailCleanup(true);
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 0, pending: 1 });
  assert.deepEqual(await f.availability.filterAvailableContent([post]), []);
  f.setFailCleanup(false);
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 1, pending: 0 });
  assert.deepEqual(f.cleaned, ["x:x-123456789"]);
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 0, pending: 0 });
});

test("cleanup removes local clip and house aliases using canonical provider identity, not substring matches", async () => {
  const f = fixture();
  const providerId = "AbC123def_-";
  const row = (asset_key: string, platform: string, external_id: string, source_url: string) =>
    ({ asset_key, platform, external_id, source_url, item: { id: external_id, platform, sourceUrl: source_url } });
  f.setMediaAssets([
    row("youtube:clip-local-uuid", "youtube", "clip-local-uuid", `https://youtu.be/${providerId}?t=12`),
    row("house:house-tour", "house", "house-tour", `https://www.youtube.com/watch?v=${providerId}`),
    row("youtube:legacy", "youtube", `clip-youtube-${providerId}`, `https://www.youtube.com/watch?v=${providerId}`),
    row("youtube:query-only", "youtube", "unrelated", `https://www.youtube.com/watch?v=ZyX987cba_-&ref=${providerId}`),
    row("house:lookalike", "house", "house-other", `https://youtube.com.evil.example/watch?v=${providerId}`),
    row("youtube:substring", "youtube", `related-${providerId}-suffix`, "https://youtu.be/ZyX987cba_-"),
  ]);
  await f.availability.recordContentRemoval({ provider: "youtube", providerId, reason: "not_found", evidence: "provider_lookup" });
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 1, pending: 0 });
  assert.deepEqual(f.cleaned, ["youtube:clip-local-uuid", "house:house-tour", "youtube:legacy"]);
});

test("cleanup joins Twitch channel clip links and legacy clip IDs to the same upstream object", async () => {
  const f = fixture();
  f.setMediaAssets([
    { asset_key: "twitch:local", platform: "twitch", external_id: "clip-local-uuid", source_url: "https://www.twitch.tv/core/clip/SomeClip", item: null },
    { asset_key: "twitch:legacy", platform: "twitch", external_id: "clip-twitch-SomeClip", source_url: null, item: null },
    { asset_key: "twitch:other", platform: "twitch", external_id: "clip-SomeClipLonger", source_url: "https://clips.twitch.tv/SomeClipLonger", item: null },
  ]);
  await f.availability.recordContentRemoval({ provider: "twitch", providerId: "clip:SomeClip", reason: "not_found", evidence: "provider_lookup" });
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 1, pending: 0 });
  assert.deepEqual(f.cleaned, ["twitch:local", "twitch:legacy"]);
});

test("quote cleanup retains parent remote-document retry identities after clearing local quote metadata", async () => {
  const f = fixture();
  await f.availability.recordContentRemoval(removal);
  f.setFailRemote(true);
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 0, pending: 1 });
  assert.equal(f.parentHasQuote(), false);
  assert.deepEqual(plain([...f.jobs.values()][0]?.related_asset_keys), ["x:x-parent"]);
  f.setFailRemote(false);
  assert.deepEqual(plain(await f.availability.drainContentRemovalCleanup()), { completed: 1, pending: 0 });
  assert.deepEqual(f.remoteDeleted, ["x:x-parent"]);
  assert.ok(!f.cleaned.includes("x:x-parent"), "the public parent must not be tombstoned with its deleted quote");
});
