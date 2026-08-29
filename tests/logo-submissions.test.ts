import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("scripts/migrations/038_logo_submissions.sql");
const publicRoute = read("app/api/logo-submissions/route.ts");
const voteRoute = read("app/api/logo-submissions/[id]/vote/route.ts");
const adminRoute = read("app/api/admin/logo-submissions/[id]/route.ts");
const fileRoute = read("app/api/logo-submissions/[id]/files/[fileId]/route.ts");

test("logo submissions remain private until an admin approves them", () => {
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(publicRoute, /WHERE s\.status='approved'/);
  assert.match(publicRoute, /f\.public_enabled=true/);
  assert.match(publicRoute, /getCurrentFanUserId/);
  assert.match(adminRoute, /requireAdmin/);
});

test("logo voting has one keyed IP record per submission and keeps downvotes private", () => {
  assert.match(migration, /PRIMARY KEY \(submission_id, ip_fingerprint\)/);
  assert.match(voteRoute, /fingerprintIp\(clientIp\(request\)\)/);
  assert.match(voteRoute, /ON CONFLICT\(submission_id,ip_fingerprint\) DO NOTHING/);
  assert.match(voteRoute, /interval '1 hour'/);
  assert.match(publicRoute, /FILTER \(WHERE v\.vote='up'\)/);
  assert.doesNotMatch(publicRoute, /downvotes/);
});

test("public file delivery is approval- and visibility-gated", () => {
  assert.match(fileRoute, /f\.public_enabled=true AND s\.status='approved'/);
  assert.match(fileRoute, /attachment/);
  assert.match(adminRoute, /public_enabled/);
});
