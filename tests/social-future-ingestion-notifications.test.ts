import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { GROUP } from "../lib/group";
import { MEMBERS } from "../lib/members";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

function functionWindow(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = end
    ? contents.indexOf(end, startIndex + start.length)
    : contents.length;
  assert.ok(startIndex >= 0, `missing ${start}`);
  assert.ok(endIndex > startIndex, `missing ${end}`);
  return contents.slice(startIndex, endIndex);
}

test("scheduled retention cannot reapply the old 100-item clip to a fourth post from any source", () => {
  const feed = source("lib/social-feed.ts");
  const reconcile = source("app/api/social/reconcile/route.ts");
  const balancer = functionWindow(
    feed,
    "function balancedFeedItems(",
    "/**\n * HOUSE feed",
  );
  const houseLoader = functionWindow(
    feed,
    "async function loadHouseFeed(",
    "const cachedHouseFeed",
  );
  const houseRefresh = functionWindow(
    feed,
    "export async function refreshHouseFeed(",
    "/**\n * CORE feed",
  );
  const coreLoader = functionWindow(
    feed,
    "async function loadCoreFeed(",
    "const cachedCoreFeed",
  );
  const coreRefresh = functionWindow(
    feed,
    "export async function refreshCoreFeed(",
    "",
  );

  const memberSourceCounts = MEMBERS.reduce((counts, member) => {
    for (const social of member.socials) {
      if (
        social.platform === "youtube" ||
        social.platform === "tiktok" ||
        social.platform === "instagram" ||
        social.platform === "x"
      ) {
        counts[social.platform] += 1;
      }
    }
    return counts;
  }, { youtube: 0, tiktok: 0, instagram: 0, x: 0 });
  assert.deepEqual(memberSourceCounts, {
    youtube: 16,
    tiktok: 6,
    instagram: 6,
    x: 6,
  });

  // balancedFeedItems takes one row from every platform/account group in each
  // round. X can render up to four media rows for one status, so reaching the
  // first row of a source's fourth status requires 13 retained rows.
  const houseSourceGroups = Object.values(memberSourceCounts).reduce((sum, count) => sum + count, 0);
  const fourthPlainPostRow = 4;
  const fourthXPostFirstMediaRow = 1 + (4 - 1) * 4;
  assert.equal(houseSourceGroups, 34);
  assert.ok(Math.floor(100 / houseSourceGroups) < fourthPlainPostRow);
  assert.ok(Math.floor(512 / houseSourceGroups) >= fourthXPostFirstMediaRow);

  const coreSourceGroups = [
    GROUP.socials.youtube,
    GROUP.socials.tiktok,
    GROUP.socials.instagram,
    GROUP.socials.x,
  ].filter((account) => Boolean(account?.handle)).length;
  assert.equal(coreSourceGroups, 4);
  assert.ok(Math.floor(128 / coreSourceGroups) >= fourthXPostFirstMediaRow);

  assert.match(balancer, /const key = `\$\{item\.authorSlug \?\? "house"\}:\$\{item\.platform\}:\$\{item\.authorLabel\}`/);
  assert.match(balancer, /let round = 0/);
  assert.match(balancer, /const item = queue\[round\]/);

  // The widened arguments equal the existing loader ceilings, so reconcile
  // retains already-returned windows; it does not ask an adapter for another
  // page or make another paid provider request.
  assert.match(houseLoader, /fetchYouTubeFeedByRef\([\s\S]{0,220}\b12,/);
  assert.match(houseLoader, /fetchTikTokFeed\([\s\S]{0,220}\b16,/);
  assert.match(houseLoader, /fetchInstagramFeed\([\s\S]{0,220}\b16,/);
  assert.match(houseLoader, /return balancedFeedItems\(all, 512\)/);
  assert.match(houseRefresh, /limit = 512/);
  assert.match(houseRefresh, /getXFeedSnapshot\(\)/);
  assert.match(coreLoader, /fetchYouTubeFeedByRef\([\s\S]{0,220}\b15\)/);
  assert.match(coreLoader, /fetchTikTokFeed\([\s\S]{0,220}\b24,/);
  assert.match(coreLoader, /fetchInstagramFeed\([\s\S]{0,220}\b24,/);
  assert.match(coreLoader, /return balancedFeedItems\(all, 128\)/);
  assert.match(coreRefresh, /limit = 128/);
  assert.match(coreRefresh, /getXFeedSnapshot\(\)/);
  assert.match(reconcile, /refreshHouseFeed\(512,/);
  assert.match(reconcile, /refreshCoreFeed\(128,/);
  assert.doesNotMatch(reconcile, /refresh(?:House|Core)Feed\(100,/);
});

test("TikTok, Instagram, and X Azure schedules remain inside the notification freshness window", () => {
  const socialWorkflow = source(".github/workflows/cron-social-events.yml");
  const xWorkflow = source(".github/workflows/cron-x-feed.yml");
  const deployment = source(".github/workflows/deploy-azure.yml");
  const refreshLeases = source("lib/social-fetch-refresh.ts");
  const normalization = source("lib/social-event-normalization.ts");
  const reconcile = source("app/api/social/reconcile/route.ts");

  assert.match(socialWorkflow, /cron: "\*\/10 \* \* \* \*"/);
  assert.match(xWorkflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(socialWorkflow, /\/api\/social\/reconcile/);
  assert.match(xWorkflow, /\/api\/social\/x\/refresh/);
  for (const workflow of [socialWorkflow, xWorkflow]) {
    assert.match(workflow, /--fail-with-body/);
    assert.match(workflow, /--retry-all-errors/);
    assert.match(workflow, /concurrency:/);
  }
  assert.match(
    deployment,
    /configure_job "coreboys-x-feed-cron" "2-59\/5 \* \* \* \*" "https:\/\/thecoreboys\.com\/api\/social\/x\/refresh"/,
  );
  assert.match(
    deployment,
    /configure_job "coreboys-social-reconcile-cron" "4-59\/10 \* \* \* \*" "https:\/\/thecoreboys\.com\/api\/social\/reconcile"/,
  );
  assert.match(deployment, /CORE_CRON_SECRET=secretref:metrics-cron-secret/);
  assert.match(deployment, /AbortSignal\.timeout\(timeout\)/);
  assert.match(deployment, /if\(!response\.ok\)process\.exit\(1\)/);

  assert.match(refreshLeases, /profile_media: 2 \* 60 \* 60/);
  assert.match(refreshLeases, /instagram_reels: 2 \* 60 \* 60/);
  assert.match(normalization, /DEFAULT_SOCIAL_NOTIFICATION_MAX_AGE_MS = 3 \* 60 \* 60 \* 1_000/);
  assert.match(reconcile, /acquireSocialFetchRefreshLease\("profile_media"\)/);
  assert.match(reconcile, /acquireSocialFetchRefreshLease\("instagram_reels"\)/);
});

test("every refreshed platform reaches canonical persistence and account-user fanout", () => {
  const feed = source("lib/social-feed.ts");
  const reconcile = source("app/api/social/reconcile/route.ts");
  const normalization = source("lib/social-event-normalization.ts");
  const events = source("lib/social-events.ts");
  const delivery = source("lib/social-delivery.ts");

  for (const provider of ["tiktok", "instagram", "x"]) {
    assert.match(normalization, new RegExp(`item\\.platform === "${provider}"`));
  }
  assert.match(feed, /refreshHouseFeed[\s\S]{0,500}getXFeedSnapshot\(\)/);
  assert.match(feed, /refreshCoreFeed[\s\S]{0,500}getXFeedSnapshot\(\)/);
  assert.match(reconcile, /const normalizedEvents = [\s\S]{0,180}\[\.\.\.houseEvents, \.\.\.coreEvents\]/);
  assert.match(reconcile, /for \(const item of normalizedEvents\)[\s\S]{0,240}socialEventFromFeedItem\(item\)[\s\S]{0,240}recordSocialEvent\(event\)/);
  assert.match(events, /ON CONFLICT \(canonical_id\) DO NOTHING/);
  assert.match(events, /return withTransaction\(async \(client\) => \{[\s\S]*createEventDeliveries\(client/);
  assert.match(events, /FROM fan_users u/);
  assert.match(events, /COALESCE\(s\.in_app_enabled,true\)=true/);
  assert.match(events, /COALESCE\(s\.push_enabled,false\)=true/);
  assert.match(events, /u\.email_verified=true[\s\S]{0,120}COALESCE\(s\.email_enabled,false\)=true/);
  assert.match(events, /ON CONFLICT \(event_id,user_id,channel\) DO NOTHING/);
  assert.match(reconcile, /drainSocialNotificationDeliveries\(100\)/);
  assert.match(delivery, /const consent = await consentFor\(row\)/);
  assert.match(delivery, /await failed\(row, error\)/);
});
