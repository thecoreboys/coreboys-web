import assert from "node:assert/strict";
import test from "node:test";
import {
  autoplayCountdownSeconds,
  isShortFormNavigationItem,
  shortFormNavigationItems,
  shortFormNavigationPosition,
  shortFormPreloadItems,
  shortFormNavigationTarget,
} from "../lib/watch/short-form-navigation";

const shorts = [
  { key: "youtube", kind: "youtube", platform: "youtube", format: "short", orientation: "portrait" },
  { key: "reel", kind: "youtube", platform: "instagram", format: "short", orientation: "portrait" },
  { key: "tiktok", kind: "clip", platform: "tiktok", format: "short", orientation: "portrait" },
];

test("short-form navigation accepts Shorts, Reels, TikToks, and other portrait video", () => {
  assert.equal(isShortFormNavigationItem(shorts[0]!), true);
  assert.equal(isShortFormNavigationItem({ key: "vertical-vod", kind: "vod", orientation: "portrait" }), true);
  assert.equal(isShortFormNavigationItem({ key: "long", kind: "youtube", format: "long", orientation: "landscape" }), false);
});

test("short-form navigation excludes portrait photos, posts, and live channels", () => {
  assert.equal(isShortFormNavigationItem({ key: "photo", kind: "youtube", format: "photo", orientation: "portrait" }), false);
  assert.equal(isShortFormNavigationItem({ key: "post", kind: "post", orientation: "portrait" }), false);
  assert.equal(isShortFormNavigationItem({ key: "live", kind: "live", format: "short", orientation: "portrait" }), false);
});

test("short-form navigation preserves channel order, removes duplicates, and wraps", () => {
  const mixed = [shorts[0]!, { key: "long", kind: "youtube", format: "long" }, shorts[1]!, shorts[0]!, shorts[2]!];
  assert.deepEqual(shortFormNavigationItems(mixed).map((item) => item.key), ["youtube", "reel", "tiktok"]);
  assert.equal(shortFormNavigationTarget(mixed, "youtube", "next")?.item.key, "reel");
  assert.equal(shortFormNavigationTarget(mixed, "youtube", "previous")?.item.key, "tiktok");
  assert.equal(shortFormNavigationTarget(mixed, "tiktok", "next")?.item.key, "youtube");
});

test("position is one-based and navigation stays disabled for a single short", () => {
  assert.deepEqual(shortFormNavigationPosition(shorts, "reel"), { index: 2, total: 3 });
  assert.equal(shortFormNavigationPosition([shorts[0]!], "youtube"), null);
  assert.equal(shortFormNavigationTarget(shorts, "missing", "next"), null);
});

test("preload window keeps the next three unique shorts warm in navigation order", () => {
  const sequence = [
    shorts[0]!,
    { key: "long", kind: "youtube", format: "long" },
    shorts[1]!,
    shorts[2]!,
    { key: "fourth", kind: "youtube", format: "short" },
    shorts[0]!,
  ];

  assert.deepEqual(
    shortFormPreloadItems(sequence, "youtube").map((item) => item.key),
    ["reel", "tiktok", "fourth"],
  );
  assert.deepEqual(
    shortFormPreloadItems(sequence, "tiktok").map((item) => item.key),
    ["fourth", "youtube", "reel"],
  );
  assert.deepEqual(shortFormPreloadItems(sequence, "youtube", 0), []);
  assert.deepEqual(shortFormPreloadItems([shorts[0]!], "youtube"), []);
});

test("short-form autoplay advances immediately while standard videos keep a countdown", () => {
  assert.equal(autoplayCountdownSeconds({ key: "short", format: "short" }, true), 0);
  assert.equal(autoplayCountdownSeconds({ key: "portrait", orientation: "portrait" }, false), 0);
  assert.equal(autoplayCountdownSeconds({ key: "video", format: "long" }, true), 8);
  assert.equal(autoplayCountdownSeconds({ key: "video", format: "long" }, false), 4);
});
