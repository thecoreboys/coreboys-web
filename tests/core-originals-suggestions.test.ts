import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as matching from "../lib/core-originals-matching";
import type { WatchItem } from "../lib/watch/types";

test("Originals deduplicate source identities across tracking links and YouTube URL forms", () => {
  assert.equal(matching.originalSourceKey("https://youtu.be/abcDEF12345?si=1"), matching.originalSourceKey("https://www.youtube.com/watch?v=abcDEF12345&t=90"));
  assert.equal(matching.originalSourceKey("https://www.instagram.com/p/ABCD/?igsh=123"), matching.originalSourceKey("https://instagram.com/p/ABCD/"));
  assert.equal(matching.originalSourceKey("javascript:alert(1)"), null);
});

test("Originals suggestions require specific title evidence, not unrelated descriptions", () => {
  assert.ok(matching.originalMatchReason("core-po-box-openings", { title: "CORE P.O. BOX OPENING", kind: "youtube" }));
  assert.equal(matching.originalMatchReason("hot-ones", { title: "A hot day in the kitchen", kind: "youtube" }), null);
  assert.equal(matching.originalMatchReason("basketball-segments", { title: "basketball", kind: "live" }), null);
  assert.equal(matching.originalMatchReason("basketball-segments", { title: "basketball", kind: "clip", format: "photo" }), null);
});

test("repeat suggestions preserve existing approved and rejected items", async () => {
  const links = ["https://youtu.be/approved123", "https://youtu.be/rejected123"];
  const inserts: unknown[][] = [];
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "./core-originals": { ensureCoreOriginalsSchema: async () => {} },
    "./core-originals-matching": matching, "./watch/catalog": {},
    "./db": { withTransaction: async (run: (db: unknown) => Promise<unknown>) => run({ query: async (sql: string, args: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.startsWith("SELECT source_url")) return { rows: links.map((source_url) => ({ source_url })) };
      assert.match(sql, /'pending'/);
      assert.doesNotMatch(sql, /UPDATE|DELETE/);
      inserts.push(args);
      links.push(String(args[1]));
      return { rows: [] };
    } }) },
  };
  const source = readFileSync(new URL("../lib/core-originals-suggestions.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {} as typeof import("../lib/core-originals-suggestions");
  vm.runInNewContext(`(function(exports, require) { ${js}\n })`)(api, (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`);
    return dependencies[id];
  });
  const candidates = ["approved123", "rejected123", "newvideo123"].map((id) => ({
    item: { sourceUrl: `https://www.youtube.com/watch?v=${id}`, platform: "youtube", title: id } as WatchItem,
    reason: "test title match",
  }));
  assert.equal(await api.suggestOriginalItems("collection", candidates), 1);
  assert.equal(await api.suggestOriginalItems("collection", candidates), 0);
  assert.equal(inserts.length, 1);
});
