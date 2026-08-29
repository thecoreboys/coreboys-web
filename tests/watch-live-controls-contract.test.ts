import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const player = readFileSync(resolve(root, "components/watch/PersistentPlayer.tsx"), "utf8");
const guide = readFileSync(resolve(root, "components/watch/GuideGrid.tsx"), "utf8");
const theater = readFileSync(resolve(root, "components/watch/TheaterStage.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/watch/watch.css"), "utf8");

test("Theater Twitch live playback uses CORE controls and shields the provider surface", () => {
  assert.match(player, /isCoreControlledTwitchLivePlayback\(current/);
  assert.match(player, /customControls=\{coreTwitchLiveControls\}/);
  assert.match(player, /twitchStartRequired/);
  assert.match(player, /Use CORE Play to continue/);
  assert.match(player, /data-core-twitch-interaction-shield/);
  assert.match(player, /data-core-twitch-native-controls-cover/);
});

test("Twitch muted autoplay keeps recovering after provider pauses without a retry cutoff", () => {
  assert.match(player, /scheduleMutedRecovery\(12_000\)/);
  assert.match(player, /scheduleMutedRecovery\(3_000\)/);
  assert.match(player, /handlersRef\.current\.onStartRequired\(\)/);
  assert.doesNotMatch(player, /pauseRecoveryCount/);
  assert.doesNotMatch(player, /autoplayAttemptCount/);
  assert.doesNotMatch(player, /Your browser paused autoplay/);
  assert.doesNotMatch(player, /blockedFallbackTimer/);
});

test("the live timeline starts at 100 percent and switches into the growing archive", () => {
  assert.match(player, /data-player-live-edge/);
  assert.match(player, /liveDvrProgressPercent/);
  assert.match(player, /startTwitchDvrAt\(Number\(event\.currentTarget\.value\)\)/);
  assert.match(player, /className={`watch-player-scrubber/);
  assert.match(player, /className={`watch-player-go-live/);
  assert.match(css, /\.watch-player-live-track > span::after/);
  assert.match(css, /\.watch-player-go-live:hover/);
});

test("Guide runtime live refreshes preserve catalog DVR metadata", () => {
  assert.match(guide, /const catalogItem = initialLive\.find/);
  assert.match(guide, /watchItem: runtimeWatchItem/);
});

test("Theater URLs preserve matching Twitch archive metadata across reloads", () => {
  assert.match(player, /query\.set\("dvr", item\.dvr\.twitchVodId\)/);
  assert.match(theater, /twitchVodId: dvrVodId/);
  assert.match(theater, /windowSeconds: dvrWindowSeconds/);
});
