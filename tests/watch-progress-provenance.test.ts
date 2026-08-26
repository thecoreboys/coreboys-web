import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const route = readFileSync(resolve(root, "app/api/account/progress/route.ts"), "utf8");
const store = readFileSync(resolve(root, "lib/watch/progress.ts"), "utf8");
const hook = readFileSync(resolve(root, "hooks/useWatchProgress.ts"), "utf8");
const migration = readFileSync(resolve(root, "scripts/migrations/025_watch_progress_provenance.sql"), "utf8");

test("manual watched state is accepted but excluded from Passport credit", () => {
  assert.match(route, /"mark_watched"/);
  assert.match(route, /if \(body\.event === "tick" \|\| body\.event === "complete"\)/);
  const passportGuard = route.match(/if \(body\.event === "tick" \|\| body\.event === "complete"\)/)?.[0] ?? "";
  assert.equal(passportGuard.includes("mark_watched"), false);
});

test("manual completion stores provenance without adding measured seconds", () => {
  assert.match(store, /completionSource = input\.event === "mark_watched" \? "manual" : "playback"/);
  assert.match(store, /INSERT INTO fan_watch_time_events/);
  assert.match(store, /if \(add > 0\)/);
  assert.match(hook, /event: "mark_watched"/);
  assert.match(hook, /completionSource: "manual"/);
});

test("schema separates completion state from auditable watch-time events", () => {
  assert.match(migration, /completion_source/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fan_watch_time_events/);
  assert.match(migration, /source IN \('site', 'provider'\)/);
});
