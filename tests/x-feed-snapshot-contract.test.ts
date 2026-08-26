import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const snapshot = source("lib/x-feed-snapshot.ts");
const upstream = source("lib/x-feed-upstream.ts");
const social = source("lib/social-feed.ts");
const refreshRoute = source("app/api/social/x/refresh/route.ts");
const migration = source("scripts/migrations/020_x_feed_snapshots.sql");
const runner = source("scripts/apply-web-migrations.mjs");
const workflow = source(".github/workflows/cron-x-feed.yml");
const communityMetadata = source("lib/x/community-metadata.ts");
const communityShelf = source("components/x/XCommunityShelf.tsx");
const homeRail = source("components/watch/XTweetsRail.tsx");
const hoverPreview = source("components/watch/XPostHoverPreview.tsx");
const xEmbed = source("components/x/XPostEmbed.tsx");

test("website X feeds are database-only and never fall back to X", () => {
  assert.match(social, /import \{ getXFeedSnapshot \} from "@\/lib\/x-feed-snapshot"/);
  assert.match(social, /getHouseFeed[\s\S]*getXFeedSnapshot\(\)/);
  assert.match(social, /getCoreFeed[\s\S]*getXFeedSnapshot\(\)/);
  assert.doesNotMatch(social, /api\.x\.com|api\.twitter\.com|platform\.twitter\.com/);
  assert.doesNotMatch(snapshot, /fetch\s*\(/);
});

test("local QA can read a durable disk snapshot without adding a visitor X call", () => {
  assert.match(snapshot, /\.cache["'],\s*["']x-feed-snapshot\.json/);
  assert.match(snapshot, /process\.env\.NODE_ENV !== "production"/);
  assert.match(snapshot, /refreshLocalXFeedSnapshot/);
  assert.match(snapshot, /X_FEED_ALLOW_LOCAL_REFRESH !== "true"/);
  assert.match(snapshot, /globalThis\.__coreboysXLocalRefresh/);
  assert.doesNotMatch(snapshot, /api\.x\.com|api\.twitter\.com/);
});

test("the protected cron route is the only roster X transport caller", () => {
  assert.match(upstream, /fetchConfiguredXFeedOnce/);
  assert.match(refreshRoute, /configuredXFeedAccounts\(\)/);
  assert.match(refreshRoute, /refreshXFeedSnapshot/);
  assert.match(refreshRoute, /fetchConfiguredXFeedOnce/);
  assert.doesNotMatch(refreshRoute, /community-metadata-refresh|refreshConfiguredXCommunityMetadata/);
  assert.match(refreshRoute, /METRICS_CRON_SECRET/);
  assert.match(refreshRoute, /timingSafeEqual/);
  assert.match(refreshRoute, /NODE_ENV !== "production"/);
  assert.match(refreshRoute, /X_FEED_ALLOW_LOCAL_REFRESH/);
  assert.match(refreshRoute, /readPostMicrousd/);
  assert.match(refreshRoute, /readUserMicrousd/);
  assert.match(refreshRoute, /fetchedUserCount/);
});

test("snapshot refreshes are globally locked, throttled, and preserve last good data", () => {
  assert.match(snapshot, /pg_try_advisory_xact_lock/);
  assert.match(snapshot, /attempted_at/);
  assert.match(snapshot, /status: "not_due"/);
  assert.match(snapshot, /status: "locked"/);
  assert.match(snapshot, /ON CONFLICT \(cache_key\) DO UPDATE SET\s+attempted_at = EXCLUDED\.attempted_at,\s+last_error = EXCLUDED\.last_error/);
  assert.doesNotMatch(
    snapshot,
    /INSERT INTO x_feed_snapshots \(cache_key, attempted_at, last_error\)[\s\S]{0,350}payload\s*=/,
  );
});

test("snapshot schema is deployed after the X integration", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS x_feed_snapshots/);
  assert.match(migration, /CHECK \(jsonb_typeof\(payload\) = 'array'\)/);
  assert.match(runner, /"019_x_integration\.sql",\s+"020_x_feed_snapshots\.sql"/);
});

test("five-minute workflow makes one authenticated refresh and home cards stay snapshot-native", () => {
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /-X POST/);
  assert.match(workflow, /x-cron-secret/);
  assert.match(workflow, /\/api\/social\/x\/refresh/);
  assert.doesNotMatch(communityMetadata, /api\.x\.com|api\.twitter\.com/);
  assert.match(communityShelf, /XPostEmbed/);
  assert.doesNotMatch(homeRail, /XPostEmbed|XProfileTimeline|fetch\s*\(/);
  assert.match(homeRail, /WatchHomeXPost/);
  assert.doesNotMatch(homeRail, /DragScrollRail/);
  assert.match(homeRail, /maxItems = 18/);
  assert.doesNotMatch(homeRail, /api\.x\.com|api\.twitter\.com|platform\.twitter\.com/);
  assert.doesNotMatch(hoverPreview, /api\.x\.com|api\.twitter\.com/);
  assert.match(xEmbed, /privacyHold && !manual/);
  assert.match(xEmbed, /Load X post/);
  assert.match(xEmbed, /dnt: true/);
});
