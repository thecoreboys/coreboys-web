import assert from "node:assert/strict";
import test from "node:test";
import type { InboxNotification } from "../lib/inbox-notification";
import { groupInboxNotifications } from "../lib/notification-groups";

const notice = (id: string, href: string, createdAt = "2026-11-08T12:00:00Z"): InboxNotification => ({ id, href, createdAt, category: "creator", title: "Creator update", body: null, imageUrl: null, avatarUrl: "/brand/logo.png", readAt: null });
test("same-day updates to one destination collapse without losing individual read states", () => {
  const latest = notice("2", "https://twitch.tv/creator");
  const earlier = { ...notice("1", latest.href), readAt: "2026-11-08T13:00:00Z" };
  const groups = groupInboxNotifications([latest, earlier, earlier]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.items.map((item) => item.id), ["2", "1"]);
  assert.equal(groups[0]?.items[1]?.readAt, earlier.readAt);
});
test("shared avatars, different days, and account notices remain distinct", () => {
  const item = notice("a", "https://twitch.tv/one");
  assert.equal(groupInboxNotifications([item, notice("b", "https://twitch.tv/two"), notice("c", item.href, "2026-11-07T12:00:00Z"), { ...notice("d", item.href), category: "account" }]).length, 4);
});
