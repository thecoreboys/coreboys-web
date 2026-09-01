import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { isInboxCategory } from "../lib/inbox-notification";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

test("notification center exposes only the supported inbox categories", () => {
  assert.equal(isInboxCategory("creator"), true);
  assert.equal(isInboxCategory("reminder"), true);
  assert.equal(isInboxCategory("account"), true);
  assert.equal(isInboxCategory("community"), true);
  assert.equal(isInboxCategory("push"), false);
  assert.equal(isInboxCategory(null), false);
});

test("inbox migration keeps notification ownership, de-duplication, and legacy read state", () => {
  const migration = source("scripts/migrations/049_notification_center.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fan_inbox_notifications/);
  assert.match(migration, /REFERENCES fan_users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE \(user_id, source_key\)/);
  assert.match(migration, /fan_inbox_notifications_unread_idx/);
  assert.match(migration, /social_notification_deliveries/);
  assert.match(migration, /delivery\.read_at/);
  assert.match(migration, /fan_notification_outbox/);
});

test("notification API is private, validates actions, and keeps reads scoped to the account", () => {
  const route = source("app/api/account/notification-center/route.ts");
  const model = source("lib/notification-center.ts");
  assert.match(route, /Cache-Control", "private, no-store"/);
  assert.match(route, /z\.string\(\)\.uuid\(\)/);
  assert.match(route, /mark_all_read/);
  assert.match(model, /WHERE id=\$1 AND user_id=\$2/);
  assert.match(model, /WHERE user_id=\$1 AND read_at IS NULL/);
  assert.match(model, /ORDER BY created_at DESC,id DESC/);
});

test("creator, Fan Zone, and membership sources all write idempotent inbox records", () => {
  const social = source("lib/social-events.ts");
  const fanzone = source("lib/fanzone-notifications.ts");
  const billing = source("app/api/account/billing/webhook/route.ts");
  assert.match(social, /INSERT INTO fan_inbox_notifications/);
  assert.match(social, /'social:' \|\| event\.id::text/);
  assert.match(fanzone, /recordInboxNotification/);
  assert.match(fanzone, /sourceKey: `fanzone:\$\{eventType\}:\$\{dedupeKey\}`/);
  assert.match(billing, /membershipInboxNotice/);
  assert.match(billing, /sourceKey: `stripe:\$\{input\.event\.id\}`/);
});

test("bell uses the private stored-data endpoint and replaces the legacy floating social tray", () => {
  const bell = source("components/notifications/NotificationBell.tsx");
  const nav = source("components/chrome/TopNav.tsx");
  const bridge = source("components/watch/WatchAlertsBridge.tsx");
  assert.match(bell, /\/api\/account\/notification-center\?limit=5/);
  assert.match(bell, /window\.setInterval\(refresh, 30_000\)/);
  assert.doesNotMatch(bell, /api\/social|useLiveStatus|Social Fetch/i);
  assert.match(nav, /NotificationBell variant="desktop"/);
  assert.match(nav, /NotificationBell variant="mobile"/);
  assert.doesNotMatch(bridge, /SocialAlertsTray/);
});
