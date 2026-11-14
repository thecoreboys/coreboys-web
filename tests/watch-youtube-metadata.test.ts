import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as providerAvailability from "../lib/provider-availability";
import * as youtubeAvailability from "../lib/watch/youtube-availability";
import type * as WatchMetadata from "../lib/watch/youtube-metadata";

type Lookup = { status?: number; body: unknown };
const oldPublication = new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString();

function metadata(responses: Lookup[]) {
  const filename = resolve("lib/watch/youtube-metadata.ts");
  const compiledModule = { exports: {} };
  const removed: Array<{ providerId: string; reason: string }> = [];
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module: compiledModule, exports: compiledModule.exports, URLSearchParams, AbortSignal,
    process: { env: { YOUTUBE_API_KEY: "test-key" } },
    fetch: async () => {
      const response = responses.shift();
      assert.ok(response, "unexpected provider request");
      return { ok: (response.status ?? 200) === 200, json: async () => response.body };
    },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/youtube-duration") return {
        formatDurationSeconds: (seconds: number) => String(seconds), isoDurationSeconds: () => 300,
      };
      if (name === "./youtube-availability") return youtubeAvailability;
      if (name === "@/lib/provider-availability") return providerAvailability;
      if (name === "@/lib/content-availability") return {
        recordContentRemoval: async (value: typeof removed[number]) => { removed.push(value); },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  }, { filename });
  return { api: compiledModule.exports as typeof WatchMetadata, removed };
}

test("a recent catalog upload can recover after videos.list initially omits it", async () => {
  const id = "abcdefghijk";
  const dates = { [id]: new Date(Date.now() - 60 * 60 * 1_000).toISOString() };
  const fixture = metadata([
    { body: { items: [] } },
    { body: { items: [{ id, status: { privacyStatus: "public", embeddable: true }, snippet: { title: "New upload" } }] } },
  ]);
  const first = await fixture.api.fetchWatchYoutubeMetadata([id], {}, dates);
  assert.equal(first[id]?.available, false, "an unconfirmed embed remains unavailable for this response");
  assert.equal(fixture.removed.length, 0, "a propagation miss must not create a permanent tombstone");
  const recovered = await fixture.api.fetchWatchYoutubeMetadata([id], {}, dates);
  assert.equal(recovered[id]?.available, true);
  assert.equal(fixture.removed.length, 0);
});

test("undated, invalid, future, and less-than-one-day catalog misses stay reversible", async () => {
  const ids = ["abcdefghijk", "lmnopqrstuv", "12345678901", "ABCDEFGHIJK"];
  const fixture = metadata([{ body: { items: [] } }]);
  await fixture.api.fetchWatchYoutubeMetadata(ids, {}, {
    [ids[1]!]: "not-a-date",
    [ids[2]!]: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    [ids[3]!]: new Date(Date.now() - 23 * 60 * 60 * 1_000).toISOString(),
  });
  assert.equal(fixture.removed.length, 0);
});

test("aged missing catalog objects and explicit private/deleted objects still create removals", async () => {
  const ids = ["abcdefghijk", "lmnopqrstuv", "12345678901", "ABCDEFGHIJK"];
  const fixture = metadata([{ body: { items: [
    { id: ids[1], status: { privacyStatus: "private" } },
    { id: ids[2], status: { uploadStatus: "deleted" } },
    { id: ids[3], status: { privacyStatus: "public", embeddable: false } },
  ] } }]);
  const result = await fixture.api.fetchWatchYoutubeMetadata(ids, {}, { [ids[0]!]: oldPublication });
  assert.deepEqual(fixture.removed.map(({ providerId, reason }) => ({ providerId, reason })), [
    { providerId: ids[0], reason: "not_found" },
    { providerId: ids[1], reason: "private" },
    { providerId: ids[2], reason: "deleted" },
  ]);
  for (const id of ids) assert.equal(result[id]?.available, false);
});

test("malformed provider envelopes and unsuccessful responses leave catalog metadata unchanged", async () => {
  const id = "abcdefghijk";
  const responses: Lookup[] = [
    { body: null }, { body: {} }, { body: { items: null } },
    { body: { items: [{}] } }, { body: { items: [null] } },
    { body: { items: [{ id: "not-requested" }] } },
    { body: { items: [{ id }, { id }] } },
    { body: { error: { code: 403 }, items: [] } },
    ...[401, 403, 404, 429, 503].map((status) => ({ status, body: { items: [] } })),
  ];
  for (const response of responses) {
    const fixture = metadata([response]);
    const result = await fixture.api.fetchWatchYoutubeMetadata([id], {}, { [id]: oldPublication });
    assert.deepEqual(Object.keys(result), [], "an inconclusive response must not hide existing catalog entries");
    assert.equal(fixture.removed.length, 0, JSON.stringify(response));
  }
});

test("YouTube chapters accept real bullet, en-dash, and em-dash separators", () => {
  const fixture = metadata([]);
  const chapters = fixture.api.parseYoutubeChapters("• 0:00 — Intro\n• 0:30 – The game\n* 1:00 - Outro", 120);
  assert.deepEqual(JSON.parse(JSON.stringify(chapters)), [
    { title: "Intro", startSeconds: 0, kind: "intro", endSeconds: 30 },
    { title: "The game", startSeconds: 30, kind: "chapter", endSeconds: 60 },
    { title: "Outro", startSeconds: 60, kind: "credits", endSeconds: 120 },
  ]);
});
