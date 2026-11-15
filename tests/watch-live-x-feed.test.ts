import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { FeedItem } from "../components/feed/types";
import { buildLiveXFeedResponse } from "../lib/watch/live-x-feed";
import { configuredXCrewFeedAccounts } from "../lib/x/crew-roster";
import { configuredXRosterFeedAccounts } from "../lib/x/roster";
import * as freshness from "../lib/x-feed-freshness";

const now = Date.now();
const at = (offsetSeconds = 0) => new Date(now + offsetSeconds * 1_000).toISOString();

function feedItem(authorSlug: string | null, handle: string, id: number, extras: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `x-${id}`, platform: "x", authorSlug, authorLabel: handle,
    title: `Update from ${handle}`, publishedAt: at(-20),
    url: `https://x.com/${handle.replace(/^@/, "")}/status/${id}`,
    mediaType: "text", ...extras,
  };
}

test("live response independently balances both audiences and excludes unregistered accounts", () => {
  const members = configuredXRosterFeedAccounts();
  const crew = configuredXCrewFeedAccounts();
  const items = [...members, ...crew].flatMap((owner, index) =>
    Array.from({ length: 4 }, (_, offset) => feedItem(owner.authorSlug, owner.handle,
      100000 + index * 10 + offset, { publishedAt: at(-index - offset * 100) })));
  items.push(feedItem("crew:unknown-person", "unregistered", 999999));
  const response = buildLiveXFeedResponse({ items, refreshedAt: at(), status: "fresh", refreshIntervalSeconds: 300 }, now);
  assert.equal(response.members.length, 18);
  assert.equal(response.crew.length, Math.min(24, crew.length * 3));
  assert.deepEqual(new Set(response.members.map((post) => post.author.slug)), new Set(members.map((owner) => owner.authorSlug ?? "core")));
  assert.deepEqual(new Set(response.crew.map((post) => post.author.slug)), new Set(crew.map((owner) => owner.authorSlug)));
  assert.ok(response.members.every((post) => !post.author.slug.startsWith("crew:")));
  assert.ok(response.crew.every((post) => post.author.slug.startsWith("crew:")));
  assert.equal(response.checkedAt, at());
});

test("live projection keeps multi-image posts, full text and quote metadata", () => {
  const owner = configuredXRosterFeedAccounts()[1]!;
  const common = feedItem(owner.authorSlug, owner.handle, 888888, {
    title: "Short provider text", mediaType: "image",
    x: {
      authorId: "123", authorHandle: owner.handle, authorName: "Creator",
      authorProfileUrl: `https://x.com/${owner.handle}`, statusId: "888888",
      statusUrl: `https://x.com/${owner.handle}/status/888888`,
      noteText: "The full post text", verified: true,
      quote: { statusId: "777777", statusUrl: "https://x.com/example/status/777777",
        text: "Quoted words", authorHandle: "example", authorProfileUrl: "https://x.com/example" },
    },
  });
  const response = buildLiveXFeedResponse({
    items: [
      { ...common, id: "x-888888-a", mediaUrl: "https://pbs.twimg.com/media/first.jpg" },
      { ...common, id: "x-888888-b", mediaUrl: "https://pbs.twimg.com/media/second.jpg" },
    ], refreshedAt: at(), status: "fresh", refreshIntervalSeconds: 300,
  }, now);
  assert.equal(response.members.length, 1);
  assert.equal(response.members[0]?.text, "The full post text");
  assert.equal(response.members[0]?.media.length, 2);
  assert.equal(response.members[0]?.quote?.text, "Quoted words");
});

test("public freshness distinguishes overdue, unavailable and genuinely empty feeds", () => {
  const base = { available: true, refreshedAt: at(-20), itemCount: 4, refreshIntervalSeconds: 300 };
  assert.equal(freshness.publicXFeedStatus(base, now), "fresh");
  assert.equal(freshness.publicXFeedStatus({ ...base, refreshedAt: at(-331) }, now), "stale");
  assert.equal(freshness.publicXFeedStatus({ ...base, failed: true }, now), "stale");
  assert.equal(freshness.publicXFeedStatus({ ...base, refreshedAt: at(10) }, now), "stale");
  assert.equal(freshness.publicXFeedStatus({ ...base, available: false }, now), "unavailable");
  assert.equal(freshness.publicXFeedStatus({ ...base, itemCount: 0 }, now), "empty");
  assert.equal(freshness.publicXFeedStatus({ ...base, refreshedAt: null, failed: true }, now), "unavailable");
});

test("source identity change resets the recent window once, while order/case changes do not", () => {
  assert.equal(freshness.xFeedSourceAccountsChanged(null, ["core:thecoreboys", "crew:said:said"]), true);
  assert.equal(freshness.xFeedSourceAccountsChanged(["core:thecoreboys"], ["core:thecoreboys", "crew:said:said"]), true);
  assert.equal(freshness.xFeedSourceAccountsChanged(["A", "B"], ["b", "a", "A"]), false);
  assert.equal(freshness.xFeedSourceAccountsChanged(["A"], undefined), false);
});

function snapshotReader(rows: unknown[] | Error, locked = true) {
  const filename = path.resolve("lib/x-feed-snapshot.ts");
  const nativeRequire = createRequire(filename);
  const calls: string[] = [];
  const transactionCalls: Array<{ sql: string; parameters: unknown[] }> = [];
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> };
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, URL,
    process: { env: { NODE_ENV: "production" }, cwd: () => process.cwd() },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidateTag: () => undefined };
      if (name === "@/lib/x-feed-freshness") return freshness;
      if (name === "@/lib/content-availability") return { filterAvailableContent: async (items: FeedItem[]) => items };
      if (name === "@/lib/db") return {
        query: async (sql: string) => { calls.push(sql); if (rows instanceof Error) throw rows; return { rows }; },
        withTransaction: async (operation: (client: unknown) => Promise<unknown>) => operation({
          query: async (sql: string, parameters: unknown[] = []) => {
            transactionCalls.push({ sql, parameters });
            if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ locked }] };
            if (/FOR UPDATE/.test(sql)) return { rows: rows instanceof Error ? [] : rows };
            return { rows: [], rowCount: 1 };
          },
        }),
      };
      return nativeRequire(name);
    },
  }, { filename });
  return { read: module.exports.getPublicXFeedSnapshot!,
    refresh: module.exports.refreshXFeedSnapshot!, append: module.exports.appendXFeedSnapshotItems!,
    calls, transactionCalls };
}

test("public DB failures stay unavailable and perform no schema/provider work", async () => {
  const reader = snapshotReader(new Error("connection unavailable"));
  const result = await reader.read();
  assert.equal(result.status, "unavailable");
  assert.equal(result.items.length, 0);
  assert.equal(reader.calls.length, 1);
  assert.equal(reader.transactionCalls.length, 0);
  assert.match(reader.calls[0]!, /^SELECT/);
  assert.equal("lastError" in result, false);
});

test("fresh stream posts remain visible when cron expires without renewing older posts", async () => {
  const reader = snapshotReader([{
    refreshed_at: at(-25 * 3600), attempted_at: at(-25 * 3600),
    stream_received_at: at(-1), last_error: null,
    payload: [feedItem("lacy", "lacy", 666661), feedItem("lacy", "lacy", 666662, { publishedAt: at(-25 * 3600) })],
  }]);
  const result = await reader.read();
  assert.equal(result.status, "stale");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "x-666661");
  assert.equal(result.refreshedAt, at(-25 * 3600));
  assert.equal(result.streamReceivedAt, at(-1));
});

test("a streamed post cannot advance the periodic search cursor or conceal a new source", async () => {
  const writer = snapshotReader([{
    refreshed_at: at(-400), attempted_at: at(-400), last_error: null,
    source_accounts: ["core:thecoreboys"], search_cursor: "100000",
    payload: [feedItem("crew:said", "_saidd1", 999999)],
  }]);
  const result = await writer.refresh(async (existing: { searchCursor?: string; sourceAccountsChanged: boolean; items: FeedItem[] }) => {
    assert.equal(existing.searchCursor, "100000");
    assert.equal(existing.sourceAccountsChanged, true);
    assert.equal(existing.items[0]?.id, "x-999999");
    return [feedItem("lacy", "lacy", 100001)];
  }, {
    sourceAccountKeys: ["core:thecoreboys", "crew:said:_saidd1"],
    searchCursor: () => "100001",
  });
  assert.equal(result.status, "refreshed");
  const saved = writer.transactionCalls.find((call) => /INSERT INTO x_feed_snapshots/.test(call.sql));
  assert.equal(saved?.parameters[5], "100001");
  assert.equal(JSON.parse(String(saved?.parameters[1])).length, 2);
});

test("stream appends retain roster bookkeeping and fail for retry when polling holds the lock", async () => {
  const writer = snapshotReader([]);
  await writer.append([feedItem("lacy", "lacy", 100001)]);
  const saved = writer.transactionCalls.find((call) => /INSERT INTO x_feed_snapshots/.test(call.sql));
  assert.ok(saved);
  const update = saved.sql.split("ON CONFLICT")[1]!;
  assert.doesNotMatch(update, /refreshed_at|attempted_at|source_accounts|search_cursor|search_continuation/);
  assert.match(update, /stream_received_at/);
  const lockedWriter = snapshotReader([], false);
  await assert.rejects(lockedWriter.append([feedItem("lacy", "lacy", 100002)]), /x_feed_snapshot_busy/);
  assert.equal(lockedWriter.transactionCalls.some((call) => /INSERT/.test(call.sql)), false);
});

test("periodic refresh persists resumable pages and clears them only on explicit completion", async () => {
  const continuation = { nextToken: "page-2", sinceId: "100000", highWatermark: "100200" };
  const row = { refreshed_at: at(-400), attempted_at: at(-400), payload: [],
    search_cursor: "100000", search_continuation: continuation };
  const pending = snapshotReader([row]);
  await pending.refresh(async (existing: { searchCursor?: string; searchContinuation?: typeof continuation }) => {
    assert.equal(existing.searchCursor, "100000");
    assert.equal(JSON.stringify(existing.searchContinuation), JSON.stringify(continuation));
    return [];
  }, { searchContinuation: () => ({ ...continuation, nextToken: "page-3" }) });
  const pendingSave = pending.transactionCalls.find((call) => /INSERT INTO x_feed_snapshots/.test(call.sql))!;
  assert.equal(pendingSave.parameters[5], null);
  assert.equal(JSON.parse(String(pendingSave.parameters[6])).nextToken, "page-3");
  assert.equal(pendingSave.parameters[7], true);

  const completed = snapshotReader([row]);
  await completed.refresh(async () => [], { searchCursor: () => "100200", searchContinuation: () => null });
  const completeSave = completed.transactionCalls.find((call) => /INSERT INTO x_feed_snapshots/.test(call.sql))!;
  assert.equal(completeSave.parameters[5], "100200");
  assert.equal(JSON.parse(String(completeSave.parameters[6])), null);
  assert.equal(completeSave.parameters[7], true);

  const unchanged = snapshotReader([row]);
  await unchanged.refresh(async () => []);
  const unchangedSave = unchanged.transactionCalls.find((call) => /INSERT INTO x_feed_snapshots/.test(call.sql))!;
  assert.equal(unchangedSave.parameters[7], false);
});

test("a successful but incomplete search window remains visibly stale while posts catch up", async () => {
  const reader = snapshotReader([{
    refreshed_at: at(-2), attempted_at: at(-2), last_error: null,
    search_continuation: { nextToken: "page-2", highWatermark: "100200" },
    payload: [feedItem("lacy", "lacy", 100200)],
  }]);
  const result = await reader.read();
  assert.equal(result.items.length, 1);
  assert.equal(result.status, "stale");
  assert.equal("searchContinuation" in result, false);
});
