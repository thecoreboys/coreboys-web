import assert from "node:assert/strict";
import test from "node:test";
import { notificationTargetFor } from "../lib/notification-target";

test("playable creator notifications open the matching Theater route", () => {
  const target = notificationTargetFor({
    href: "https://www.tiktok.com/@core/video/1234567890123",
    title: "New short",
  });
  assert.equal(target.kind, "theater");
  assert.match(target.href, /^\/theater\?/);
  assert.match(target.href, /src=tiktok/);
  assert.match(target.href, /orientation=portrait/);
});

test("Twitch live notification paths are promoted to Theater", () => {
  const target = notificationTargetFor({ href: "/watch/live/stableronaldo", title: "StableRonaldo is live" });
  assert.equal(target.kind, "theater");
  assert.match(target.href, /kind=live/);
  assert.match(target.href, /login=stableronaldo/);
});

test("X posts stay in a first-party preview until explicitly opened", () => {
  const target = notificationTargetFor({ href: "https://x.com/core/status/1234567890123", title: "A post" });
  assert.equal(target.kind, "preview");
  assert.match(target.href, /^\/preview\?/);
  assert.match(target.href, /url=https%3A%2F%2Fx.com/);
});

test("CORE account destinations remain internal links", () => {
  const target = notificationTargetFor({ href: "/account/notifications", title: "Account update" });
  assert.deepEqual(target, {
    kind: "link",
    href: "/account/notifications",
    sourceHref: "/account/notifications",
    provider: "core",
  });
});
