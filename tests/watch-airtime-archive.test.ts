import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(resolve(root, "scripts/migrations/030_airtime_daily_archive.sql"), "utf8");
const runner = readFileSync(resolve(root, "scripts/apply-web-migrations.mjs"), "utf8");
const archiveLoader = readFileSync(resolve(root, "lib/watch/airtime-archive.ts"), "utf8");
const reconcile = readFileSync(resolve(root, "lib/streams/reconcile.ts"), "utf8");
const snapshotRoute = readFileSync(resolve(root, "app/api/metrics/twitchtracker/snapshot/route.ts"), "utf8");

test("daily airtime archive is durable, day-keyed, and registered after stream sessions", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS airtime_daily_archive/);
  assert.match(migration, /PRIMARY KEY \(member_slug, archive_date\)/);
  assert.match(migration, /minutes_streamed\s+INTEGER NOT NULL/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS airtime_daily_archive_member_date_idx/);
  assert.match(runner, /"030_airtime_daily_archive\.sql"/);
  assert.ok(
    runner.indexOf("002_stream_sessions.sql") < runner.indexOf("030_airtime_daily_archive.sql"),
    "archive migration must run after the detailed session ledger exists",
  );
});

test("archive refresh splits sessions by UTC day, upserts corrections, and retains historic rows", () => {
  assert.match(migration, /generate_series\(/);
  assert.match(migration, /AT TIME ZONE 'UTC'/);
  assert.match(migration, /ON CONFLICT \(member_slug, archive_date\)/);
  assert.match(migration, /DO UPDATE SET/);
  assert.match(migration, /intentionally retained/);
  assert.match(migration, /SELECT refresh_airtime_daily_archive\(/);
});

test("archive reads and writers fail closed before migration and are scheduled by both collectors", () => {
  assert.match(archiveLoader, /catch \{\s*return \[\];\s*\}/);
  assert.match(archiveLoader, /catch \{\s*return null;\s*\}/);
  assert.match(reconcile, /await refreshAirtimeDailyArchive\(\{ days: 3 \}\)/);
  assert.match(snapshotRoute, /refreshAirtimeDailyArchive\(\{ force: true \}\)/);
});
