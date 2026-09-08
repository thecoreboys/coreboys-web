import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

function loadModule(file: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {};
  vm.runInNewContext(`(function(exports, require) { ${js}\n })`, { process, setInterval, clearInterval })(api, (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`);
    return dependencies[id];
  });
  return api;
}

test("job metadata is immutable and obsolete revisions are not loaded", async () => {
  let rows: unknown[] = [{ item: { id: "1", platform: "youtube", title: "new title" } }];
  const api = loadModule("../lib/media-intelligence/jobs.ts", {
    "server-only": {}, "./azure": {},
    "./schema": { mediaIntelligenceQuery: async (sql: string) => {
      assert.match(sql, /r\.is_current AND a\.active/);
      return { rows };
    } },
  }) as typeof import("../lib/media-intelligence/jobs");
  const job = { payload: { analysisItem: { id: "1", platform: "youtube", title: "original title" } } } as unknown as Parameters<typeof api.loadMediaJobItem>[0];
  assert.equal((await api.loadMediaJobItem(job))?.title, "original title");
  rows = [];
  assert.equal(await api.loadMediaJobItem(job), null);
});

for (const scenario of ["superseded", "legacy", "current"] as const) {
  test(`worker handles ${scenario} revision without retry churn`, async () => {
    const events: string[] = [];
    const job = { id: "old", revisionId: "old", idempotencyKey: "old", stage: "metadata", analyzer: "local", analyzerVersion: "1", priority: 100 };
    let claimed = false;
    const analyzer = { name: "local", version: "1", stage: "metadata", analyze: async () => { events.push("analyze"); return {}; } };
    const api = loadModule("../lib/media-intelligence/worker.ts", {
      "server-only": {}, "./policy": { sourcePolicyFor: () => ({}) },
      "./analyzer": {
        availableMediaAnalyzers: () => [analyzer],
        prepareWatchItem: () => ({ asset: { key: "youtube:1", item: {} }, revision: { id: scenario === "legacy" ? "new" : "old" }, claim: { idempotencyKey: scenario === "legacy" ? "new" : "old" } }),
      },
      "./postgres-store": { getMediaIntelligenceStore: () => ({
        prepareRevision: async () => { events.push("prepare"); },
        claimAnalysis: async () => "claimed", completeAnalysis: async () => {}, failAnalysis: async () => {},
      }) },
      "./jobs": {
        claimNextAnalysisJob: async () => { if (claimed) return null; claimed = true; return job; },
        renewAnalysisJobLease: async () => true,
        loadMediaJobItem: async () => scenario === "superseded" ? null : {},
        enqueueAnalysisJob: async () => { events.push("enqueue"); },
        cancelClaimedAnalysisJob: async () => { events.push("cancel"); return true; },
        completeAnalysisJob: async () => true,
        failAnalysisJob: async () => { events.push("fail"); },
        dispatchMediaOutbox: async () => ({ published: 0 }),
      },
    }) as typeof import("../lib/media-intelligence/worker");
    const result = await api.runMediaWorkerBatch({ maxJobs: 2 });
    assert.equal(result.failed, 0);
    assert.deepEqual(events, scenario === "current" ? ["analyze"] : scenario === "legacy" ? ["prepare", "enqueue", "cancel"] : ["cancel"]);
  });
}
