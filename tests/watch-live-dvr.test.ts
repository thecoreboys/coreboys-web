import assert from "node:assert/strict";
import test from "node:test";
import {
  clampLiveDvrPosition,
  liveDvrBehindSeconds,
  liveDvrProgressPercent,
  shouldEnterLiveDvr,
  twitchLiveDvrWindowSeconds,
} from "../lib/watch/live-dvr";

const liveWithArchive = {
  kind: "live",
  platform: "twitch",
  dvr: {
    enabled: true,
    twitchVodId: "2851780769",
    windowSeconds: 4_937,
  },
};

test("uses the matching growing Twitch archive as the rewind window", () => {
  assert.equal(twitchLiveDvrWindowSeconds(liveWithArchive), 4_937);
  assert.equal(twitchLiveDvrWindowSeconds(liveWithArchive, 5_000), 5_000);
});

test("does not advertise rewind without a valid live Twitch archive", () => {
  assert.equal(twitchLiveDvrWindowSeconds({ ...liveWithArchive, kind: "vod" }), 0);
  assert.equal(twitchLiveDvrWindowSeconds({ ...liveWithArchive, platform: "youtube" }), 0);
  assert.equal(twitchLiveDvrWindowSeconds({ ...liveWithArchive, dvr: { enabled: true } }), 0);
  assert.equal(twitchLiveDvrWindowSeconds({ ...liveWithArchive, dvr: null }, 6_000), 0);
});

test("live DVR positions clamp and report an accurate live edge", () => {
  assert.equal(clampLiveDvrPosition(-20, 100), 0);
  assert.equal(clampLiveDvrPosition(120, 100), 100);
  assert.equal(liveDvrProgressPercent(100, 100), 100);
  assert.equal(liveDvrProgressPercent(25, 100), 25);
  assert.equal(liveDvrProgressPercent(0, 0), 100);
  assert.equal(liveDvrBehindSeconds(75, 100), 25);
});

test("the live edge stays live while an earlier point enters DVR playback", () => {
  assert.equal(shouldEnterLiveDvr(100, 100), false);
  assert.equal(shouldEnterLiveDvr(99.5, 100), false);
  assert.equal(shouldEnterLiveDvr(95, 100), true);
});
