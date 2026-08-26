import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = read("scripts/migrations/018_fanzone_communities.sql");
const store = read("lib/fanzone-communities.ts");
const pollStore = read("lib/community.ts");
const communityRoute = read("app/api/fanzone/communities/route.ts");
const adminPollCreate = read("app/api/admin/polls/route.ts");
const adminPollEdit = read("app/api/admin/polls/[id]/route.ts");
const accountExport = read("app/api/account/export/route.ts");
const migrationRunner = read("scripts/apply-web-migrations.mjs");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

test("questions are staff-review-first and only public after approval", () => {
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending'[\s\S]*'approved','answered','denied','removed'/);
  assert.match(store, /VALUES \(\$1,\$2,\$3,\$4,'pending','automated text screen passed; staff review required'\)/);
  assert.match(store, /status IN \('approved','answered'\) OR \(\$2::text IS NOT NULL AND user_id=\$2\)/);
  assert.match(store, /action: "approve" \| "deny" \| "remove" \| "answer"/);
  assert.match(store, /INSERT INTO fanzone_community_audit/);
});

test("ideas stay private while pending and votes require approval", () => {
  assert.match(migration, /moderation_state TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(store, /ideas\.moderation_state='approved' AND ideas\.status<>'removed'/);
  assert.match(store, /OR \(\$2::text IS NOT NULL AND ideas\.user_id=\$2\)/);
  assert.match(store, /idea\.rows\[0\]\.moderation_state !== "approved"/);
  assert.match(store, /consumeCommunityRateLimit\(userId, "idea\.create", 3/);
  assert.match(store, /consumeCommunityRateLimit\(userId, "idea\.vote", 120/);
});

test("poll targeting is explicit and legacy polls resolve to CORE only", () => {
  assert.match(migration, /ALTER TABLE polls[\s\S]*ADD COLUMN IF NOT EXISTS community_key TEXT/);
  assert.match(pollStore, /\$4='core' AND COALESCE\(community_key,'core'\)='core'/);
  assert.match(pollStore, /\$4<>'core' AND community_key=\$4/);
  assert.match(communityRoute, /listPolls\(userId, \{ communityKey: selected \}\)/);
  assert.match(adminPollCreate, /communityKey: z\.enum\(FANZONE_COMMUNITY_KEYS\)\.nullable\(\)\.optional\(\)/);
  assert.match(adminPollEdit, /communityKey: body\.communityKey/);
});

test("alerts persist per community while the weekly digest remains account-wide", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fanzone_community_subscriptions/);
  assert.match(migration, /PRIMARY KEY \(user_id, community_key\)/);
  assert.match(store, /FROM fanzone_community_subscriptions WHERE user_id=\$1/);
  assert.match(store, /subscriptionResult\.rows\.find\(\(row\) => row\.community_key === selectedKey\)/);
  assert.match(store, /ON CONFLICT \(user_id,community_key\) DO UPDATE SET/);
  assert.match(communityRoute, /communityKey: z\.enum\(FANZONE_COMMUNITY_KEYS\)/);
});

test("every unsafe native Communities route performs a same-origin check", () => {
  const routeFiles = [
    resolve(root, "app/api/fanzone/communities"),
    resolve(root, "app/api/admin/fanzone/communities"),
  ].flatMap((directory) =>
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === "route.ts")
      .map((entry) => resolve(entry.parentPath, entry.name)),
  );
  assert.ok(routeFiles.length >= 7);
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    if (!/export async function (POST|PATCH|PUT|DELETE)/.test(source)) continue;
    assert.match(source, /requestHasSameOrigin\(/, `${file} must reject cross-site unsafe requests`);
  }
});

test("community privacy export and deletion cover all native participation tables", () => {
  assert.match(accountExport, /exportCommunityAccountData\(uid\)/);
  for (const table of [
    "fanzone_community_memberships",
    "fanzone_community_subscriptions",
    "fanzone_community_preferences",
    "fanzone_community_questions",
    "fanzone_community_ideas",
    "fanzone_community_idea_votes",
    "fanzone_community_reports",
    "fanzone_community_appeals",
  ]) {
    assert.match(store, new RegExp(`DELETE FROM ${table}`), `${table} must be covered by FanZone deletion`);
  }
  assert.match(store, /kind='community'/);
  assert.match(communityRoute, /deleteXNominationAccountData\(userId\)/);
});

test("migration 018 is registered before X integration migrations", () => {
  assert.match(migrationRunner, /"018_fanzone_communities\.sql"/);
  assert.ok(
    migrationRunner.indexOf("018_fanzone_communities.sql") <
      migrationRunner.indexOf("019_x_integration.sql"),
  );
});
