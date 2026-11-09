import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as availability from "../lib/provider-availability";
import { isLikelyYouTubeShort } from "../lib/youtube-classification";

function metadata(responses: unknown[]) {
  const filename = path.resolve("lib/youtube-duration.ts");
  const module = { exports: {} };
  const removed: Array<{ providerId: string; reason: string }> = [];
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams,
    process: { env: { YOUTUBE_API_KEY: "mock-key" } },
    fetch: async () => ({ ok: true, json: async () => responses.shift() }),
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/youtube-classification") return { isLikelyYouTubeShort };
      if (name === "@/lib/provider-availability") return availability;
      if (name === "@/lib/content-availability") return { recordContentRemoval: async (value: typeof removed[number]) => { removed.push(value); } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  }, { filename });
  return { api: module.exports as typeof import("../lib/youtube-duration"), removed };
}

test("an announced upload missing from its first metadata lookup is not permanently tombstoned", async () => {
  const f = metadata([{ items: [] }, { items: [{ id: "abcdefghijk", status: { privacyStatus: "public", uploadStatus: "processed" }, contentDetails: { duration: "PT5M" }, snippet: { title: "New upload" } }] }]);
  const first = await f.api.fetchYouTubeMetadata(["abcdefghijk"], {}, { fresh: true });
  assert.deepEqual(Object.keys(first), []);
  assert.deepEqual(f.removed, []);
  const second = await f.api.fetchYouTubeMetadata(["abcdefghijk"], {}, { fresh: true });
  assert.equal(second.abcdefghijk?.durationSeconds, 300);
  assert.deepEqual(f.removed, []);
});

test("fresh metadata still honors explicit provider private/deleted states", async () => {
  const f = metadata([{ items: [
    { id: "abcdefghijk", status: { privacyStatus: "private" } },
    { id: "lmnopqrstuv", status: { uploadStatus: "deleted" } },
  ] }]);
  const result = await f.api.fetchYouTubeMetadata(["abcdefghijk", "lmnopqrstuv"], {}, { fresh: true });
  assert.deepEqual(Object.keys(result), []);
  assert.deepEqual(f.removed.map(({ providerId, reason }) => ({ providerId, reason })), [
    { providerId: "abcdefghijk", reason: "private" }, { providerId: "lmnopqrstuv", reason: "deleted" },
  ]);
});
