import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as text from "../lib/media-intelligence/text";
import * as embedding from "../lib/media-intelligence/embedding";
import * as discovery from "../lib/watch/discovery";
import { getLocalMetadataAnalyzer, prepareWatchItem } from "../lib/media-intelligence/analyzer";
import type { SearchDocument } from "../lib/media-intelligence/types";
import type { WatchItem } from "../lib/watch/types";

test("natural query focus retains subjects and concept matching respects word boundaries", () => {
  assert.equal(text.focusedMediaQuery("the stream where they played Minecraft with friends"), "minecraft friends");
  assert.equal(text.focusedMediaQuery("find funny clips from the kitchen"), "funny kitchen");
  assert.deepEqual(text.expandConcepts("shortbread photographically"), []);
  assert.ok(text.expandConcepts("YouTube shorts").includes("vertical video"));
});

test("natural search ranks real chapter evidence over a generic stream without inventing timestamps", async () => {
  const analyzer = getLocalMetadataAnalyzer();
  const documents: SearchDocument[] = [];
  for (const [id, title, chapters] of [
    ["1", "Weekend with the crew", [{ title: "Minecraft with friends", startSeconds: 120 }]],
    ["2", "The stream where they were playing", undefined],
  ] as const) {
    const item = { id, title, kind: "youtube", platform: "youtube", memberSlug: "lacy", memberLabel: "Lacy", poster: "", href: "/", chapters } as unknown as WatchItem;
    const prepared = prepareWatchItem(item, analyzer);
    const result = await analyzer.analyze(item, prepared.asset, prepared.revision, prepared.claim);
    for (const segment of result.segments) documents.push({
      asset: prepared.asset, revisionId: prepared.revision.id, segment,
      tags: result.tags.filter((tag) => tag.segmentId === segment.id).map((tag) => tag.tag),
      aliases: result.aliases.map((alias) => ({ value: alias.alias, weight: alias.weight })),
      embedding: result.embeddings.find((row) => row.segmentId === segment.id)?.vector ?? null,
    });
  }
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "./text": text, "./embedding": embedding,
    "@/lib/watch/discovery": discovery,
    "./postgres-store": { getMediaIntelligenceStore: () => ({ searchDocuments: async () => documents }) },
  };
  const source = readFileSync(new URL("../lib/media-intelligence/search.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {} as typeof import("../lib/media-intelligence/search");
  vm.runInNewContext(`(function(exports, require) { ${js}\n })`)(api, (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`);
    return dependencies[id];
  });
  const result = await api.searchMedia({ query: "the stream where they played Minecraft with friends" });
  assert.equal(result.results[0]?.item.id, "1");
  assert.ok(result.results[0]?.matchedTerms.includes("minecraft"));
  assert.equal(result.results[0]?.moment?.startSeconds, 120);
  assert.equal(result.results.find((hit) => hit.item.id === "2")?.moment ?? null, null);
});
