import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as policy from "../lib/ai-budget-policy";

function harness(initialSpend = 0, unavailable = false) {
  let spend = initialSpend;
  let gate = Promise.resolve();
  const events = new Map<string, { cost: number; status: string }>();
  const query = async (sql: string, args: unknown[] = []): Promise<{ rows: unknown[] }> => {
    if (unavailable) throw new Error("database unavailable");
    if (sql.includes("sum(")) return { rows: [{ spend: String(spend) }] };
    if (sql.includes("FROM ai_provider_controls")) return { rows: [{ provider: args[0], enabled: true, daily_request_limit: 100, per_subject_hour_limit: 10, monthly_budget_cents: 4000 }] };
    if (sql.includes("count(*)")) return { rows: [{ count: "0" }] };
    if (sql.includes("INSERT INTO ai_usage_events")) {
      const cost = Number(args[7]);
      spend += cost;
      events.set(String(args[0]), { cost, status: "reserved" });
      return { rows: [] };
    }
    if (sql.includes("UPDATE ai_usage_events")) {
      const event = events.get(String(args[0]));
      if (event?.status === "reserved") {
        if (sql.includes("status = 'cancelled'")) { event.status = "cancelled"; spend -= event.cost; }
        else { event.status = "completed"; }
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "node:crypto": { randomUUID }, "@/lib/ai-budget-policy": policy,
    "@/lib/db": {
      query,
      withTransaction: async (run: (client: { query: typeof query }) => Promise<unknown>) => {
        let unlock: (() => void) | undefined;
        try {
          return await run({ query: async (sql, args) => {
            if (sql.includes("pg_advisory_xact_lock")) {
              const previous = gate;
              gate = new Promise<void>((resolve) => { unlock = resolve; });
              await previous;
              return { rows: [] };
            }
            return query(sql, args);
          } });
        } finally { unlock?.(); }
      },
    },
  };
  const source = readFileSync(new URL("../lib/ai-usage.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports, require) { ${js}\n })`, { console: { error() {} } })(module.exports, (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
    return dependencies[id];
  });
  return { api: module.exports as typeof import("../lib/ai-usage"), spend: () => spend, events };
}

const request = { provider: "anthropic" as const, feature: "test", model: "unknown", estimatedInputTokens: 1, maxOutputTokens: 0 };

test("two providers cannot both reserve the last available budget", async () => {
  const { api, spend } = harness(39_999_997);
  const decisions = await Promise.all([api.reserveAiUsage(request), api.reserveAiUsage({ ...request, provider: "elevenlabs" })]);
  assert.equal(decisions.filter((result) => result.ok).length, 1);
  assert.equal(spend(), 40_000_000);
  assert.ok(decisions.some((result) => !result.ok && result.reason === "monthly_budget"));
});

test("timeouts retain budget; only requests known not to have been sent may be cancelled", async () => {
  const { api, spend } = harness();
  const decision = await api.reserveAiUsage(request);
  assert.ok(decision.ok);
  await api.markAiUsageUncertain(decision.reservationId);
  await api.cancelAiUsage(decision.reservationId);
  assert.equal(spend(), 3);
  const unsent = await api.reserveAiUsage(request);
  assert.ok(unsent.ok);
  await api.cancelAiUsage(unsent.reservationId);
  assert.equal(spend(), 3);
});

test("accounting outages and invalid requests fail closed", async () => {
  const { api } = harness(0, true);
  assert.equal((await api.reserveAiUsage(request)).ok, false);
  const validDb = harness();
  assert.equal((await validDb.api.reserveAiUsage({ ...request, maxOutputTokens: NaN })).ok, false);
  assert.equal(validDb.spend(), 0);
});
