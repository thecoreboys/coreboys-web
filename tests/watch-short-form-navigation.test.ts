import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SHORT_FORM_PRELOAD_ITEMS,
  autoplayCountdownSeconds,
  isShortFormNavigationItem,
  mergeRefreshedChannelItems,
  shortFormNavigationItems,
  shortFormNavigationPosition,
  shortFormPreloadBudget,
  shortFormPreloadItems,
  shortFormNavigationTarget,
} from "../lib/watch/short-form-navigation";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

test("short-form preload budget stages a bounded look-ahead without fighting constrained devices", () => {
  assert.equal(MAX_SHORT_FORM_PRELOAD_ITEMS, 2);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, idleReady: false }), 1);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, idleReady: true }), 2);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, idleReady: true, effectiveType: "3g" }), 1);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, idleReady: true, deviceMemoryGb: 2 }), 1);
  assert.equal(shortFormPreloadBudget({ dataSaver: true, idleReady: true }), 0);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, qualityPreference: "data-saver", idleReady: true }), 0);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, saveData: true, idleReady: true }), 0);
  assert.equal(shortFormPreloadBudget({ dataSaver: false, effectiveType: "2g", idleReady: true }), 0);
});

test("short-form autoplay advances immediately while standard videos keep a countdown", () => {
  assert.equal(autoplayCountdownSeconds({ key: "short", format: "short" }, true), 0);
  assert.equal(autoplayCountdownSeconds({ key: "portrait", orientation: "portrait" }, false), 0);
  assert.equal(autoplayCountdownSeconds({ key: "video", format: "long" }, true), 8);
  assert.equal(autoplayCountdownSeconds({ key: "video", format: "long" }, false), 4);
});

test("refreshed channel items add new posts without replacing the active playable", () => {
  const active = { ...shorts[1]!, title: "currently playing object" };
  const previous = [shorts[0]!, active, shorts[2]!];
  const refreshed = [
    { key: "new-reel", kind: "clip", platform: "instagram", format: "short" },
    { ...active, title: "new metadata must not restart playback" },
    shorts[0]!,
  ];

  const merged = mergeRefreshedChannelItems(previous, refreshed, active.key);
  assert.deepEqual(merged.map((item) => item.key), ["new-reel", "reel", "youtube"]);
  assert.equal(merged[1], active);
  assert.equal(merged.length, Math.max(previous.length, refreshed.length));
});

test("refreshed channel items retain the active playable through a partial feed window", () => {
  const active = shorts[2]!;
  const merged = mergeRefreshedChannelItems(
    shorts,
    [{ key: "new-short", kind: "youtube", platform: "youtube", format: "short", orientation: "portrait" }],
    active.key,
  );
  assert.equal(merged.some((item) => item.key === active.key), true);
  assert.equal(merged.find((item) => item.key === active.key), active);
  assert.equal(new Set(merged.map((item) => item.key)).size, merged.length);
});

test("the Shorts route sends refreshed items through channel-aware refill", () => {
  const stage = readFileSync(resolve(process.cwd(), "components/watch/ShortsStage.tsx"), "utf8");
  const provider = readFileSync(resolve(process.cwd(), "components/providers/PlayerProvider.tsx"), "utf8");

  assert.match(stage, /channel\?\.id === SHORTS_CHANNEL\.id/);
  assert.match(stage, /refill\(playables, \{ channelId: SHORTS_CHANNEL\.id \}\)/);
  assert.match(provider, /mergeRefreshedChannelItems\(previousItems, refreshedItems, activeItem\.key\)/);
  assert.match(provider, /setChannelItems\(merged\)/);
  assert.match(provider, /commitQueue\(channelOrder\(merged, activeItem\.key\)\)/);
});

test("the Shorts player promotes warmed provider frames without changing their source URL", () => {
  const player = readFileSync(resolve(process.cwd(), "components/watch/PersistentPlayer.tsx"), "utf8");
  const stage = readFileSync(resolve(process.cwd(), "components/watch/ShortsStage.tsx"), "utf8");

  assert.match(player, /shortFormPreloads\s*\.slice\(0, futureShortFormPreloadCount\)/);
  assert.match(player, /index === 0 \|\| item\.platform !== "instagram"/);
  assert.match(player, /requestIdleCallback/);
  assert.match(player, /document\.visibilityState !== "visible"/);
  assert.match(player, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(stage, /connection\?\.saveData/);
  assert.match(player, /autoplay: false,[\s\S]{0,180}loop: false/);
  assert.doesNotMatch(player, /autoplay: item\.key === current\.key/);
  assert.match(player, /func: "playVideo"/);
  assert.match(player, /type: "play"/);
  assert.match(player, /if \(current\.platform !== "instagram"\) \{\s*playingRef\.current = usesVisibleTimeProxy\(current\)/);
  const preloadDeck = player.slice(player.indexOf("data-short-form-preload-deck"));
  assert.doesNotMatch(preloadDeck, /playingRef\.current = usesVisibleTimeProxy\(item\)/);
  assert.doesNotMatch(preloadDeck, /setIsPlaying\(true\)/);
});
