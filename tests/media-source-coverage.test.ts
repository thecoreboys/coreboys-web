import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

function coverage(query: (sql: string) => Promise<{ rows: unknown[] }>) {
  const source = readFileSync(new URL("../lib/media-intelligence/coverage.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {};
  vm.runInNewContext(`(function(exports, require) { ${js}\n })`, {})(api, (id: string) => {
    if (id === "server-only") return {};
    if (id === "./schema") return { mediaIntelligenceQuery: query };
    if (id === "./azure") return { azureMediaRuntimeState: () => ({ enabled: false }) };
    throw new Error(`Unexpected import ${id}`);
  });
  return api as typeof import("../lib/media-intelligence/coverage");
}

test("source coverage distinguishes indexed posts, media references and live streams", async () => {
  const api = coverage(async (sql) => {
    if (sql.includes("FROM media_intelligence_assets GROUP")) {
      assert.match(sql, /active AND NOT is_live/);
      assert.match(sql, /jsonb_typeof\(item->'mediaUrl'\) = 'string'/);
      assert.match(sql, /length\(trim\(item->>'mediaUrl'\)\) > 0/);
      return { rows: [{ platform: "youtube", total: "12", active: "10", media_references: "2", live: "3" }] };
    }
    if (sql.includes("FROM media_intelligence_transcript_imports")) {
      assert.match(sql, /expires_at > now\(\)/);
      return { rows: [{ status: "draft", total: "1" }] };
    }
    return { rows: [] };
  });
  const result = await api.mediaIntelligenceCoverage();
  assert.deepEqual(JSON.parse(JSON.stringify(result.assets)), [{ platform: "youtube", total: 12, active: 10, mediaReferences: 2, live: 3 }]);
  assert.equal(result.transcripts[0]!.status, "draft");
  assert.ok(!("ready" in result.assets[0]!));
});

test("failed coverage is not reported as an empty healthy index", async () => {
  const api = coverage(async () => { throw new Error("database unavailable"); });
  await assert.rejects(api.mediaIntelligenceCoverage, /database unavailable/);
  const route = readFileSync(new URL("../app/api/admin/media-intelligence/route.ts", import.meta.url), "utf8");
  const get = route.split("export async function GET()")[1]!.split("export async function POST")[0]!;
  assert.match(get, /status: 503/);
  assert.match(get, /private, no-store/);
  assert.doesNotMatch(get, /error\.message/);
  const ui = readFileSync(new URL("../components/admin/TranscriptManager.tsx", import.meta.url), "utf8");
  assert.match(ui, /Missing data does not mean there are no sources/);
  assert.match(ui, /Retry source check/);
  assert.match(ui, /mediaReferences\?\.toLocaleString\(\) \?\? "Not checked"/);
});
