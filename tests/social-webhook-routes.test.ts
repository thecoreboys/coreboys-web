import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("provider webhook routes authenticate raw payloads and defer heavy work", () => {
  const youtube = read("app/api/social/webhooks/youtube/route.ts");
  const twitch = read("app/api/social/webhooks/twitch/route.ts");
  const meta = read("app/api/social/webhooks/meta/route.ts");
  const tiktok = read("app/api/social/webhooks/tiktok/route.ts");

  assert.match(youtube, /webhook_not_configured/);
  assert.match(youtube, /matchesSha1Hmac/);
  assert.match(youtube, /webhookState: "verified"/);
  assert.match(youtube, /after\(/);
  assert.match(twitch, /matchesHmac/);
  assert.match(twitch, /webhook_callback_verification[\s\S]*webhookState: "verified"/);
  assert.match(twitch, /after\(/);
  assert.match(meta, /x-hub-signature-256/);
  assert.match(meta, /fetchInstagramFeed/);
  assert.match(meta, /credentialStateForOfficialFeed/);
  assert.match(meta, /normalizeCreatorProviderUserId/);
  assert.match(meta, /\{ fresh: true \}/);
  assert.match(meta, /after\(/);
  assert.match(tiktok, /tiktok-signature/);
  assert.match(tiktok, /matchesTikTokHmac/);
  assert.match(tiktok, /fetchTikTokFeedResult/);
  assert.match(tiktok, /credentialStateForOfficialFeed/);
  assert.doesNotMatch(tiktok, /tiktok-timestamp/);
  assert.match(tiktok, /after\(/);
  for (const route of [youtube, twitch, meta, tiktok]) {
    assert.match(route, /drainSocialNotificationDeliveries/);
  }
});

test("source health distinguishes webhook receipt from reconciliation", () => {
  const sourceStore = read("lib/social-events.ts");
  assert.match(sourceStore, /received\?: boolean/);
  assert.match(sourceStore, /input\.received === true/);
  assert.match(sourceStore, /last_received_at/);
});

test("reconciliation is a serialized ten-minute fallback", () => {
  const workflow = read(".github/workflows/cron-social-events.yml");
  const route = read("app/api/social/reconcile/route.ts");
  const middleware = read("middleware.ts");
  assert.match(workflow, /\*\/10 \* \* \* \*/);
  assert.doesNotMatch(workflow, /\*\/2 \* \* \* \*/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(route, /configuredYouTubeWebhookChannels/);
  assert.match(route, /add\("twitch", member\.twitchLogin/);
  assert.match(route, /add\("x", GROUP\.socials\.x/);
  assert.doesNotMatch(route, /accountRef: item\.authorSlug \?\? item\.authorLabel/);
  assert.match(route, /webhookState: appReady \? undefined : "not_configured"/);
  assert.match(route, /preserveExpired: !publicHealth/);
  assert.match(workflow, /APP_URL: https:\/\/thecoreboys\.com/);
  assert.match(middleware, /"\/api\/social\/reconcile"/);
  assert.match(middleware, /"\/api\/social\/x\/refresh"/);
});

test("provider subscriptions are idempotently provisioned and renewed", () => {
  const provisioner = read("lib/social-subscriptions.ts");
  const route = read("app/api/social/subscriptions/provision/route.ts");
  const workflow = read(".github/workflows/cron-social-subscriptions.yml");
  const youtubeWebhook = read("app/api/social/webhooks/youtube/route.ts");
  const socialFeed = read("lib/social-feed.ts");

  assert.match(route, /x-cron-secret/);
  assert.match(route, /privateJson/);
  assert.match(route, /Cache-Control.*private, no-store/s);
  assert.match(provisioner, /eventsub\/subscriptions/);
  assert.match(provisioner, /stream\.online/);
  assert.match(provisioner, /stream\.offline/);
  assert.match(provisioner, /webhook_callback_verification_pending/);
  assert.match(provisioner, /pubsubhubbub\.appspot\.com\/subscribe/);
  assert.match(provisioner, /hub\.lease_seconds/);
  assert.match(provisioner, /configuredYouTubeWebhookChannels/);
  assert.match(provisioner, /loopbackOrPrivate/);
  assert.match(provisioner, /127\(\?:\\\.\\d\{1,3\}\)\{3\}/);
  assert.match(provisioner, /192\\\.168/);
  assert.match(provisioner, /sslip\\\.io/);
  assert.match(workflow, /api\/social\/subscriptions\/provision/);
  assert.match(workflow, /cron: "17 6 \* \* \*"/);
  assert.match(workflow, /APP_URL: https:\/\/thecoreboys\.com/);
  assert.match(socialFeed, /ROSTER_YOUTUBE_CHANNEL_IDS/);
  assert.match(youtubeWebhook, /configuredYouTubeWebhookChannels/);
  assert.match(youtubeWebhook, /createHash\("sha256"\)\.update\(raw\)/);
});

test("the operator connectivity audit distinguishes required signed webhooks from creator polling", () => {
  const audit = read("scripts/check-social-connections.mjs");

  assert.match(audit, /Signed webhook readiness/);
  assert.match(audit, /publicHttpsOrigin/);
  assert.match(audit, /provisionerAuth/);
  assert.match(audit, /social_webhook_receipts/);
  assert.match(audit, /sources verified/);
  assert.match(audit, /Twitch EventSub/);
  assert.match(audit, /YouTube WebSub/);
  assert.match(audit, /!report\.webhooks\.twitch/);
  assert.match(audit, /!report\.webhooks\.youtube/);
  assert.match(audit, /TikTok and Instagram post refreshes have a scheduled polling fallback/);
  assert.match(audit, /creator token map/);
  assert.match(audit, /Notification delivery/);
  assert.match(audit, /pushConfigured/);
  assert.match(audit, /emailConfigured/);
});
