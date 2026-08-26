import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the explicit TypeScript suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { clampPreviewPosition, previewPlaybackSample } from "../lib/watch/preview-progress.ts";

test("reads YouTube preview time and duration updates", () => {
  assert.deepEqual(
    previewPlaybackSample(JSON.stringify({
      event: "infoDelivery",
      info: { currentTime: 391.4, duration: 1_157 },
    })),
    { positionSeconds: 391.4, durationSeconds: 1_157, playing: null },
  );
});

test("reads TikTok preview time updates, including the loop boundary", () => {
  assert.deepEqual(
    previewPlaybackSample({
      "x-tiktok-player": true,
      type: "onCurrentTime",
      value: { currentTime: 0, duration: 28.25 },
    }),
    { positionSeconds: 0, durationSeconds: 28.25, playing: null },
  );
});

test("reports explicit provider play and pause evidence separately from time", () => {
  assert.deepEqual(
    previewPlaybackSample({
      event: "infoDelivery",
      info: { currentTime: 12, duration: 40, playerState: 1 },
    }),
    { positionSeconds: 12, durationSeconds: 40, playing: true },
  );
  assert.deepEqual(
    previewPlaybackSample({ event: "onStateChange", info: 2 }),
    { positionSeconds: null, durationSeconds: null, playing: false },
  );
  assert.deepEqual(
    previewPlaybackSample({
      "x-tiktok-player": true,
      type: "onStateChange",
      value: 1,
    }),
    { positionSeconds: null, durationSeconds: null, playing: true },
  );
  assert.deepEqual(
    previewPlaybackSample({
      "x-tiktok-player": true,
      type: "onStateChange",
      value: 2,
    }),
    { positionSeconds: null, durationSeconds: null, playing: false },
  );
});

test("ignores unrelated provider messages and clamps displayed playback", () => {
  assert.equal(previewPlaybackSample({ event: "onReady" }), null);
  assert.equal(previewPlaybackSample("not-json"), null);
  assert.equal(clampPreviewPosition(73, 60), 60);
  assert.equal(clampPreviewPosition(-5, 60), 0);
});
