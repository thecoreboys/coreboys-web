import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AI_MONTHLY_BUDGET_CENTS, estimatedAiCostMicroUsd, fitsAiMonthlyBudget } from "../lib/ai-budget-policy";

test("AI allowance is one $40 ceiling, not a separate allowance per provider", () => {
  assert.equal(AI_MONTHLY_BUDGET_CENTS, 4000);
  assert.equal(fitsAiMonthlyBudget(39_999_000, 1_000), true);
  assert.equal(fitsAiMonthlyBudget(39_999_000, 1_001), false);
  assert.equal(fitsAiMonthlyBudget(40_000_001, 0), false);
});

test("invalid accounting cannot bypass the budget", () => {
  for (const invalid of [NaN, Infinity, -1, 0.5]) {
    assert.equal(fitsAiMonthlyBudget(invalid, 0), false);
    assert.equal(fitsAiMonthlyBudget(0, invalid), false);
  }
  for (const invalid of [NaN, Infinity, -1, 10_000_001]) {
    assert.throws(() => estimatedAiCostMicroUsd("unknown", invalid, 1));
    assert.throws(() => estimatedAiCostMicroUsd("unknown", 1, invalid));
  }
});

test("reservations round upwards and unknown models use conservative pricing", () => {
  assert.equal(estimatedAiCostMicroUsd("claude-haiku-4-5-20251001", 1000, 100), 1500);
  assert.equal(estimatedAiCostMicroUsd("unknown", 1000, 100), 4500);
  assert.equal(estimatedAiCostMicroUsd("unknown", 0.1, 0.1), 18);
});

test("shared reservations serialize before reading spend, and uncertain calls remain billable", () => {
  const source = readFileSync(new URL("../lib/ai-usage.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("pg_advisory_xact_lock") < source.indexOf("const total ="));
  assert.ok(source.indexOf("fitsAiMonthlyBudget(Number") < source.indexOf("INSERT INTO ai_usage_events"));
  assert.match(source, /now\(\) AT TIME ZONE 'UTC'/);
  const uncertain = source.slice(source.indexOf("export async function markAiUsageUncertain"), source.indexOf("export async function getAiUsageDashboard"));
  assert.match(uncertain, /status = 'completed'/);
  assert.doesNotMatch(uncertain, /cancelled|actual_cost_microusd = 0/);
});
