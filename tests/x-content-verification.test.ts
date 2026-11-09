import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { FeedItem } from "../components/feed/types";
import { collectXQuoteLookupReferences, fetchXQuoteLookupOnce, type XQuoteLookupResult } from "../lib/x-feed-request";

const reference = (statusId: string) => ({ statusId, statusUrl: `https://x.com/i/status/${statusId}` });
const primary = (id: string, quoteId?: string, hydrated = true) => ({
  platform: "x", id: `x-${id}`, x: { statusId: id,
    ...(quoteId ? hydrated ? { quote: { ...reference(quoteId), text: "Stored quote", authorHandle: "ExternalAuthor" } }
      : { quoteReference: reference(quoteId) } : {}) },
}) as FeedItem;
const missing = (id: string, overrides: Record<string, unknown> = {}) => ({
  resource_id: id, resource_type: "tweet", title: "Not Found Error",
  type: "https://api.x.com/2/problems/resource-not-found", ...overrides,
});
const post = (id: string) => ({ id, author_id: "author", text: "A post", created_at: "2026-11-01T00:00:00Z" });
const lookup = (ids: string[], payload: unknown, status = 200) => fetchXQuoteLookupOnce(ids.map(reference), {
  bearerToken: "test-only", fetchImpl: async () => new Response(JSON.stringify(payload), { status }),
});

test("X deletion evidence requires an explicit requested tweet resource-not-found error", async () => {
  const result = await lookup(["10001", "10002", "10003", "10004", "10005", "10006", "10007"], {
    data: [post("10001")], errors: [
      missing("10001"), // Contradictory error must not override a returned post.
      missing("10002"),
      missing("10003", { type: "https://api.x.com/2/problems/not-authorized-for-resource" }),
      missing("10004", { resource_type: "user" }),
      missing("10005", { type: "https://untrusted.example/2/problems/resource-not-found" }),
      missing("10006", { resource_type: undefined }),
      missing("99999"), // An expansion or unrequested ID is not deletion proof.
    ],
  });
  assert.deepEqual([...result.confirmedMissingIds!], ["10002"]);
  assert.deepEqual([...result.foundIds!], ["10001"]);
  assert.equal(result.quotes.size, 0, "a returned post without author expansion is still found/billable");
  assert.equal(result.confirmedMissingIds!.has("10007"), false, "omissions are inconclusive");
  for (const status of [401, 403, 404, 429, 500]) {
    await assert.rejects(lookup(["10002"], { errors: [missing("10002")] }, status));
  }
});

test("lookup counts returned resources, including primary posts, and accepts the legacy official problem URI", async () => {
  const result = await lookup(["10001", "10002", "10003"], {
    data: [post("10001"), post("10002")],
    includes: { users: [{ id: "author", username: "ExternalAuthor" }] },
    errors: [missing("10003", { type: "https://api.twitter.com/2/problems/resource-not-found" })],
  });
  assert.equal(result.foundIds?.size, 2);
  assert.equal(result.returnedUserCount, 1);
  assert.deepEqual([...result.confirmedMissingIds!], ["10003"]);
});

test("daily verification IDs all fit in the one bounded lookup before pending hydration", () => {
  const verification = Array.from({ length: 10 }, (_, i) => reference(String(10000 + i)));
  const items = Array.from({ length: 30 }, (_, i) => primary(String(20000 + i), String(30000 + i), false));
  const combined = collectXQuoteLookupReferences(items, verification);
  assert.equal(combined.length, 20);
  assert.deepEqual(combined.slice(0, 10), verification);
  assert.deepEqual(combined.slice(10).map((item) => item.statusId), items.slice(0, 10).map((item) => item.x!.quoteReference!.statusId));
  const deduplicated = collectXQuoteLookupReferences([primary("20000", "10000", false)], verification);
  assert.equal(deduplicated.length, 10);
});

function fixture() {
  type Row = { statusId: string; priority: number; attempt: number | null; due: number; outcome: string };
  const rows = new Map<string, Row>();
  let now = 0;
  let nextRun = 0;
  let txTail = Promise.resolve();
  const removed: string[] = [];
  const checked: string[] = [];
  const tombstones = new Set<string>();
  let failRemoval = false;
  const dbQuery = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO x_content_verification_checks")) {
      const ids = params[0] as string[];
      const priorities = params[1] as number[];
      ids.forEach((statusId, i) => {
        const priority = priorities[i];
        assert.notEqual(priority, undefined);
        const prior = rows.get(statusId);
        if (prior) prior.priority = Math.min(prior.priority, priority!);
        else rows.set(statusId, { statusId, priority: priority!, attempt: null, due: now, outcome: "unknown" });
      });
      return { rows: [] };
    }
    if (sql.includes("UPDATE x_content_verification_schedule")) {
      if (now < nextRun) return { rows: [] };
      nextRun = now + 24;
      return { rows: [{ lane: "stored_posts" }] };
    }
    if (sql.includes("SELECT status_id FROM x_content_verification_checks")) {
      assert.equal(params[0], 10);
      return { rows: [...rows.values()].filter((row) => row.due <= now && row.outcome !== "not_found" && !tombstones.has(row.statusId))
        .sort((a, b) => (a.attempt ?? -1) - (b.attempt ?? -1) || a.priority - b.priority || a.statusId.localeCompare(b.statusId))
        .slice(0, Number(params[0])).map((row) => ({ status_id: row.statusId })) };
    }
    if (sql.includes("SET last_attempt_at")) {
      for (const id of params[0] as string[]) Object.assign(rows.get(id)!, { attempt: now, due: now + 24 });
      return { rows: [] };
    }
    if (sql.includes("SET last_checked_at")) {
      const id = params[0] as string;
      checked.push(`${id}:${params[1]}`);
      rows.get(id)!.outcome = params[1] as string;
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL ${sql}`);
  };
  const filename = path.resolve("lib/x-content-verification.ts");
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: (name: string) => {
    if (name === "server-only") return {};
    if (name === "@/lib/db") return { query: dbQuery, withTransaction: async (run: (client: { query: typeof dbQuery }) => Promise<unknown>) => {
      const previous = txTail;
      let release!: () => void;
      txTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await run({ query: dbQuery }); } finally { release(); }
    } };
    if (name === "@/lib/content-availability") return { recordContentRemoval: async (input: { providerId: string; reason: string; evidence: string }) => {
      assert.equal(input.reason, "not_found");
      assert.equal(input.evidence, "provider_lookup");
      if (failRemoval) throw new Error("DB failed");
      removed.push(input.providerId);
    } };
    throw new Error(`Unexpected dependency ${name}`);
  } }, { filename });
  return { api: module.exports as typeof import("../lib/x-content-verification"), rows, removed, checked, tombstones,
    advanceDay: () => { now += 24; }, failRemoval: () => { failRemoval = true; } };
}

test("one durable daily owner reserves ten IDs, including external quotes, across concurrent refreshes", async () => {
  const f = fixture();
  const items = Array.from({ length: 12 }, (_, i) => primary(String(20000 + i), String(10000 + i)));
  const results = await Promise.all([f.api.reserveXContentVerification(items), f.api.reserveXContentVerification(items), f.api.reserveXContentVerification(items)]);
  assert.deepEqual(results.map((result) => result.length), [10, 0, 0]);
  assert.deepEqual(Array.from(results[0], (item) => item.statusId), Array.from({ length: 10 }, (_, i) => String(10000 + i)));
  assert.deepEqual(f.checked, [], "reservations never pretend an unissued lookup was checked");
  assert.equal((await f.api.reserveXContentVerification(items)).length, 0, "crashes/budget denial do not reset the daily allowance");
});

test("rotation persists IDs outside the latest snapshot and eventually includes primary posts", async () => {
  const f = fixture();
  f.tombstones.add("10000");
  const first = await f.api.reserveXContentVerification(Array.from({ length: 12 }, (_, i) => primary(String(20000 + i), String(10000 + i))));
  assert.equal(first.some((item) => item.statusId === "10000"), false);
  f.advanceDay();
  const next = await f.api.reserveXContentVerification([]);
  assert.equal(next.length, 10);
  assert.equal(next[0]?.statusId, "10011");
  assert.equal(next[1]?.statusId, "20000");
  assert.equal(next.some((item) => first.some((prior) => prior.statusId === item.statusId)), false);
});

test("only reserved confirmed-missing IDs become tombstones; generic unavailable IDs remain unknown", async () => {
  const f = fixture();
  const refs = await f.api.reserveXContentVerification([primary("20000", "10000"), primary("20001", "10001")]);
  const result: XQuoteLookupResult = { quotes: new Map(), unavailableIds: new Set(["10000", "10001", "20000", "20001"]),
    foundIds: new Set(["20000"]), confirmedMissingIds: new Set(["10000", "20000", "99999"]) };
  const completed = await f.api.completeXContentVerification(refs, result);
  assert.deepEqual(f.removed, ["10000"]);
  assert.equal(completed.removed, 1);
  assert.equal(completed.unknown, 2);
  assert.deepEqual(f.checked, ["10000:not_found", "10001:unknown", "20000:found", "20001:unknown"]);
});

test("failed removal persistence remains retriable instead of retiring the candidate", async () => {
  const f = fixture();
  const refs = await f.api.reserveXContentVerification([primary("20000")]);
  f.failRemoval();
  const result = await f.api.completeXContentVerification(refs, { quotes: new Map(), unavailableIds: new Set(["20000"]), confirmedMissingIds: new Set(["20000"]) });
  assert.equal(result.removed, 0);
  assert.deepEqual(f.checked, ["20000:unknown"]);
  f.advanceDay();
  assert.equal((await f.api.reserveXContentVerification([]))[0]?.statusId, "20000");
});
