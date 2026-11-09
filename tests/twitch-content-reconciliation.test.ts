import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { TwitchAvailabilityTarget } from "../lib/twitch-content-reconciliation";

function load() {
  const filename = path.resolve("lib/twitch-content-reconciliation.ts");
  const module = { exports: {} };
  const nodeRequire = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, process, AbortSignal, require: (name: string) => {
    if (name === "server-only") return {};
    if (name.startsWith("node:")) return nodeRequire(name);
    if (name === "@/lib/db") return { query: () => { throw new Error("Live DB forbidden in this test"); } };
    if (name === "@/lib/content-availability") return { recordContentRemoval: () => { throw new Error("Live removal forbidden in this test"); } };
    if (name === "@/lib/twitch") return { getAppAccessToken: () => { throw new Error("Live provider forbidden in this test"); } };
    throw new Error(`Unexpected dependency ${name}`);
  } }, { filename });
  return module.exports as typeof import("../lib/twitch-content-reconciliation");
}
const api = load();
const video = (id: string): TwitchAvailabilityTarget => ({ kind: "videos", id, sourceUrl: `https://www.twitch.tv/videos/${id}` });
const clip = (id: string): TwitchAvailabilityTarget => ({ kind: "clips", id, sourceUrl: `https://clips.twitch.tv/${id}` });
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("Twitch availability targets exclude live channels and untrusted hosts", () => {
  assert.deepEqual(plain(api.twitchAvailabilityTarget({ sourceUrl: "https://www.twitch.tv/videos/123456?t=30s" })), video("123456"));
  assert.deepEqual(plain(api.twitchAvailabilityTarget({ sourceUrl: "https://www.twitch.tv/crew/clip/SomeClip" })), clip("SomeClip"));
  for (const sourceUrl of ["https://www.twitch.tv/core", "https://twitch.tv.evil.example/videos/123", "https://evil.example/twitch.tv/videos/123", "https://clips.twitch.tv/embed", "/theater/vod-123", "http://twitch.tv/videos/123"]) {
    assert.equal(api.twitchAvailabilityTarget({ sourceUrl }), null);
  }
  assert.equal(api.twitchAvailabilityTarget({ sourceUrl: "https://twitch.tv/videos/123", kind: "live" }), null);
});

test("only successful complete ID lookups confirm missing Twitch objects", () => {
  assert.deepEqual(plain([...api.twitchAvailabilityOutcomes(["123", "456"], { status: 200, body: { data: [{ id: "123" }] } })]), [["123", "found"], ["456", "not_found"]]);
  assert.deepEqual(plain([...api.twitchAvailabilityOutcomes(["ClipOne"], { status: 200, body: { data: [] } })]), [["ClipOne", "not_found"]]);
  const uncertain = [
    ...[400, 401, 403, 404, 429, 500].map((status) => ({ status, body: { data: [] } })),
    ...[null, {}, { data: null }, { data: [{ title: "No ID" }] }, { data: [{ id: "unrequested" }] }, { data: [{ id: "123" }, { id: "123" }] }, { data: [], error: "bad token" }, { data: [], pagination: { cursor: "next" } }].map((body) => ({ status: 200, body })),
  ];
  for (const response of uncertain) assert.deepEqual(plain([...api.twitchAvailabilityOutcomes(["123", "456"], response)]), [["123", "unknown"], ["456", "unknown"]]);
});

test("documented all-IDs-missing Videos 404 requires Twitch's object-specific JSON envelope", () => {
  const provider404 = { status: 404, body: { status: 404, error: "Not Found", message: "All of the ids were not found." } };
  assert.deepEqual(plain([...api.twitchAvailabilityOutcomes(["123", "456"], provider404, "videos")]), [["123", "not_found"], ["456", "not_found"]]);
  assert.deepEqual(plain([...api.twitchAvailabilityOutcomes(["ClipOne"], provider404, "clips")]), [["ClipOne", "unknown"]]);
  for (const body of ["<html>Not found</html>", null, { status: 404, error: "Not Found", message: "Route not found" }, { status: 500, error: "Not Found", message: "Video ID was not found" }, { status: 404, message: "Video ID was not found" }]) {
    assert.deepEqual(plain([...api.twitchAvailabilityOutcomes(["123"], { status: 404, body }, "videos")]), [["123", "unknown"]]);
  }
});

function fixture(options: { claim?: boolean; owns?: boolean; configured?: boolean; throwLookup?: boolean; removeFails?: boolean; candidates?: TwitchAvailabilityTarget[] } = {}) {
  let claimed = false;
  const calls: string[] = [];
  const removed: string[] = [];
  const checked: string[] = [];
  const run = api.createTwitchAvailabilityReconciler({
    configured: () => options.configured !== false,
    claim: async () => { if (options.claim === false || claimed) return null; claimed = true; return "lease"; },
    ownsLease: async () => options.owns !== false,
    seed: async () => { calls.push("seed"); },
    due: async (limit) => { assert.equal(limit, 50); return options.candidates ?? [video("123"), clip("ClipOne")]; },
    lookup: async (kind, ids) => { calls.push(`${kind}:${ids.length}`); if (options.throwLookup) throw new Error("network timeout"); return { status: 200, body: { data: [] } }; },
    remove: async (target) => { if (options.removeFails) throw new Error("DB offline"); removed.push(target.id); },
    checked: async (target, outcome) => { checked.push(`${target.id}:${outcome}`); },
    release: async (token) => { assert.equal(token, "lease"); calls.push("release"); },
  });
  return { run, calls, removed, checked };
}

test("a concurrent cron contender performs no seed or provider calls without the global lease", async () => {
  const f = fixture();
  const runs = await Promise.all([f.run(), f.run(), f.run()]);
  assert.equal(runs.filter((result) => result.status === "not_due").length, 2);
  assert.equal(f.calls.filter((value) => value === "seed").length, 1);
  assert.equal(f.calls.filter((value) => value === "videos:1").length, 1);
  assert.equal(f.calls.filter((value) => value === "clips:1").length, 1);
});

test("Twitch reconciliation bounds rotating checks to fifty objects and two batched requests", async () => {
  const candidates = Array.from({ length: 100 }, (_, index) => index % 2 ? clip(`Clip${index}`) : video(String(index + 100)));
  const f = fixture({ candidates });
  const result = await f.run();
  assert.equal(result.checked, 50);
  assert.equal(result.removed, 50);
  assert.equal(result.requests, 2);
  assert.deepEqual(f.calls, ["seed", "videos:25", "clips:25", "release"]);
});

test("failed lookup/removal is retriable unknown, never successful deletion evidence", async () => {
  for (const options of [{ throwLookup: true }, { removeFails: true }]) {
    const f = fixture(options);
    const result = await f.run();
    assert.equal(result.unknown, 2);
    assert.equal(result.removed, 0);
    assert.deepEqual(f.removed, []);
    assert.deepEqual(f.checked, ["123:unknown", "ClipOne:unknown"]);
    assert.equal(f.calls.at(-1), "release");
  }
});

test("credentials and renewed lease ownership are checked before any outbound batch", async () => {
  const unconfigured = fixture({ configured: false });
  assert.equal((await unconfigured.run()).status, "unconfigured");
  assert.deepEqual(unconfigured.calls, []);
  const lost = fixture({ owns: false });
  assert.equal((await lost.run()).status, "lease_lost");
  assert.deepEqual(lost.calls, ["seed", "release"]);
  assert.deepEqual(lost.removed, []);
});

test("persistent Twitch schedule retains candidates after they leave the latest-feed window", () => {
  const sql = readFileSync(path.resolve("scripts/migrations/059_twitch_content_verification.sql"), "utf8");
  const source = readFileSync(path.resolve("lib/twitch-content-reconciliation.ts"), "utf8");
  assert.match(sql, /PRIMARY KEY \(kind,provider_id\)/);
  assert.match(source, /ON CONFLICT\(kind,provider_id\) DO NOTHING/);
  assert.doesNotMatch(source, /DELETE FROM twitch_content_verification_checks/);
  assert.match(source, /next_run_at=now\(\)\+interval '2 hours'/);
  assert.match(source, /outcome === "found" \? 24 : outcome === "unknown" \? 6/);
});
