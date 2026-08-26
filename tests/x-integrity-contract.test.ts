import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("public X nominations hide moderator notes and only one post can be featured", () => {
  const nominations = source("lib/x/nominations.ts");
  const config = source("lib/x/config.ts");
  const migration = source("scripts/migrations/019_x_integration.sql");
  assert.match(nominations, /note: includePrivate \? row\.note : null/);
  assert.match(nominations, /coreboys:x-single-featured-post/);
  assert.match(nominations, /SET featured=false/);
  assert.match(config, /getConfiguredXFeaturedPostIds[\s\S]*\.slice\(0, 1\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS x_post_nominations_single_featured_idx[\s\S]*WHERE status='approved' AND featured=true/);
});

test("disconnected native actions bill zero and all native calls time out", () => {
  const actions = source("lib/x/actions.ts");
  assert.match(actions, /errorCode: "reconnect",[\s\S]{0,120}billable: false/);
  assert.match(actions, /if \(input\.billable !== false\)[\s\S]{0,300}INSERT INTO x_api_usage/);
  assert.match(actions, /signal: AbortSignal\.timeout\(12_000\)/);
});

test("paid reads reserve the worst case before X and share the write ceiling", () => {
  const usage = source("lib/x/usage.ts");
  const feed = source("app/api/social/x/refresh/route.ts");
  const communities = source("lib/x/community-metadata-refresh.ts");
  assert.match(usage, /coreboys:x-api-monthly-spend/);
  assert.match(usage, /SUM\(reserved_microusd\)[\s\S]*x_api_reservations/);
  assert.match(usage, /spent \+ worstCase > cap/);
  assert.ok(feed.indexOf("const gate = await reserveXApiBudget") < feed.indexOf("await fetchConfiguredXFeedOnce"));
  assert.match(feed, /500 \* archivePages/);
  assert.match(feed, /Math\.max\(10, Math\.min\(100, accounts\.length \* 12\)\)/);
  assert.ok(communities.indexOf("reserveXApiBudgetInTransaction") < communities.indexOf("for (const entry of due)"));
  assert.match(communities, /AbortSignal\.timeout\(LOOKUP_TIMEOUT_MS\)/);
  assert.match(communities, /\{ unavailable: true \}, FAILURE_BACKOFF_HOURS/);
});

test("visitor community reads are cache-only", () => {
  const visitor = source("lib/x/community-metadata.ts");
  assert.doesNotMatch(visitor, /api\.x\.com|api\.twitter\.com|fetch\s*\(/);
  assert.match(visitor, /UPDATE x_api_cache SET hit_count=hit_count\+1/);
});

test("FanZone privacy export and deletion include X nominations without token data", () => {
  const nominations = source("lib/x/nominations.ts");
  const accountExport = source("app/api/account/export/route.ts");
  const communityRoute = source("app/api/fanzone/communities/route.ts");
  assert.match(accountExport, /exportXNominationAccountData\(uid\)/);
  assert.match(accountExport, /xPostNominations/);
  assert.match(communityRoute, /deleteXNominationAccountData\(userId\)/);
  assert.match(nominations, /DELETE FROM x_post_nominations WHERE user_id=\$1/);
  assert.doesNotMatch(nominations, /access_token|refresh_token/);
});
