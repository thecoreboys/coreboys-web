import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("event insert and idempotent recipient fanout share one transaction", () => {
  const events = read("lib/social-events.ts");
  assert.match(events, /return withTransaction\(async \(client\) => \{[\s\S]*INSERT INTO social_content_events[\s\S]*createEventDeliveries\(client/);
  assert.match(events, /Always retry the idempotent fanout/);
  assert.match(events, /notification_eligible/);
  assert.match(events, /stale_backfill/);
});

test("delivery claim SQL uses legal UPDATE aliases and one lease deadline", () => {
  const delivery = read("lib/social-delivery.ts");
  assert.match(delivery, /FROM ready, social_content_events e, fan_users u/);
  assert.doesNotMatch(delivery, /FROM ready JOIN social_content_events e ON e\.id=d\.event_id/);
  assert.match(delivery, /status IN \('pending','failed','processing'\).*available_at <= now\(\)/s);
  assert.doesNotMatch(delivery, /status='processing' AND available_at < now\(\) - interval '15 minutes'/);
  assert.match(delivery, /MAX_DELIVERY_ATTEMPTS/);
  assert.match(delivery, /socialNotificationMaxAgeMs/);
  assert.match(delivery, /e\.published_at < now\(\)-\(\$4::integer \* interval '1 second'\)/);
  assert.match(delivery, /'stale_delivery'/);
  assert.match(delivery, /e\.published_at >= now\(\)-\(\$4::integer \* interval '1 second'\)/);
});

test("workers recheck preferences, verification, and active push consent before send", () => {
  const delivery = read("lib/social-delivery.ts");
  assert.match(delivery, /async function consentFor/);
  assert.match(delivery, /COALESCE\(s\.push_enabled,false\)/);
  assert.match(delivery, /COALESCE\(s\.email_enabled,false\)/);
  assert.match(delivery, /email_verified/);
  assert.match(delivery, /has_active_push/);
  assert.match(delivery, /notification_preference_disabled/);
});

test("webhook receipts complete only after deferred work and failed duplicates can retry", () => {
  const events = read("lib/social-events.ts");
  assert.match(events, /processed_at,processing_started_at,attempts\)[\s\S]*NULL,now\(\),1/);
  assert.match(events, /processed_at IS NULL[\s\S]*processing_started_at IS NULL OR processing_started_at <=/);
  assert.match(events, /completeWebhookReceipt/);
  assert.match(events, /failWebhookReceipt/);
  for (const provider of ["twitch", "youtube", "tiktok", "meta"]) {
    const route = read(`app/api/social/webhooks/${provider}/route.ts`);
    assert.match(route, /receipt\.shouldProcess/);
    assert.match(route, /completeWebhookReceipt/);
    assert.match(route, /failWebhookReceipt/);
  }
});

test("migration and account APIs expose notification reliability state", () => {
  const migration = read("scripts/migrations/040_social_notification_reliability.sql");
  const runner = read("scripts/apply-web-migrations.mjs");
  const settingsRoute = read("app/api/account/social-notifications/route.ts");
  const pushRoute = read("app/api/account/push-subscriptions/route.ts");
  const settingsUi = read("components/account/SocialNotificationSettings.tsx");
  assert.match(migration, /notification_eligible/);
  assert.match(migration, /processing_started_at/);
  assert.match(migration, /attempts INTEGER/);
  assert.match(migration, /youtube:yt-/);
  assert.match(migration, /tiktok:tt-/);
  assert.match(migration, /instagram:ig-/);
  assert.match(migration, /\^x:x-/);
  assert.match(migration, /ON CONFLICT \(event_id,user_id,channel\) DO NOTHING/);
  assert.match(migration, /DELETE FROM social_content_events legacy/);
  assert.match(runner, /040_social_notification_reliability\.sql/);
  assert.match(settingsRoute, /getSocialNotificationDeliveryReadiness/);
  assert.match(settingsRoute, /emailVerified/);
  assert.match(pushRoute, /push_not_ready/);
  assert.match(pushRoute, /readiness\.push\.ready/);
  assert.match(settingsUi, /pushUnavailable/);
  assert.match(settingsUi, /emailUnavailable/);
  assert.match(settingsUi, /isDisabled=\{disabled\}/);
  assert.match(settingsUi, /\/api\/account\/email-verification/);
  assert.match(settingsUi, /Send verification email/);
});
