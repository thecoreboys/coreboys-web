import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREVIEW_VOLUME,
  nextPreviewAudioOwner,
  normalizePreviewVolume,
  previewAudioSample,
  previewAudioStatusLabel,
  previewAudioSuppressionReason,
  previewVolumeRamp,
} from "../lib/watch/preview-audio";

test("normalizes the persisted preview volume into the supported range", () => {
  assert.equal(normalizePreviewVolume(undefined), DEFAULT_PREVIEW_VOLUME);
  assert.equal(normalizePreviewVolume(Number.NaN), DEFAULT_PREVIEW_VOLUME);
  assert.equal(normalizePreviewVolume(-1), 0.05);
  assert.equal(normalizePreviewVolume(2), 1);
  assert.equal(normalizePreviewVolume(0.42), 0.42);
});

test("builds bounded monotonic fades that finish on the requested volume", () => {
  const fadeIn = previewVolumeRamp(0, 0.4, 4);
  assert.deepEqual(fadeIn, [0.1, 0.2, 0.30000000000000004, 0.4]);
  assert.ok(fadeIn.every((value, index) => index === 0 || value > fadeIn[index - 1]!));

  const fadeOut = previewVolumeRamp(0.4, 0, 2);
  assert.deepEqual(fadeOut, [0.2, 0]);
  assert.deepEqual(previewVolumeRamp(4, -2, 0), [0]);
});

test("reads confirmed YouTube audio state and ignores unrelated messages", () => {
  assert.deepEqual(
    previewAudioSample(JSON.stringify({
      event: "infoDelivery",
      info: { muted: false, volume: 35, playerState: 1 },
    })),
    { muted: false, volume: 0.35, playing: true },
  );
  assert.deepEqual(
    previewAudioSample({ event: "infoDelivery", info: { muted: true } }),
    { muted: true, volume: null, playing: null },
  );
  assert.deepEqual(
    previewAudioSample({ event: "infoDelivery", info: { muted: false, playerState: 2 } }),
    { muted: false, volume: null, playing: false },
  );
  assert.equal(previewAudioSample({ event: "onReady" }), null);
  assert.equal(previewAudioSample("not-json"), null);
});

test("uses truthful, user-facing preview audio labels", () => {
  assert.equal(previewAudioStatusLabel("on"), "Sound on");
  assert.equal(previewAudioStatusLabel("blocked"), "Muted by browser");
  assert.equal(previewAudioStatusLabel("unavailable"), "Audio unavailable");
});

test("keeps exactly one owner and ignores a stale preview release", () => {
  const first = nextPreviewAudioOwner(null, { type: "claim", ownerId: "preview-a" });
  const second = nextPreviewAudioOwner(first, { type: "claim", ownerId: "preview-b" });
  assert.equal(second, "preview-b");
  assert.equal(nextPreviewAudioOwner(second, { type: "release", ownerId: "preview-a" }), "preview-b");
  assert.equal(nextPreviewAudioOwner(second, { type: "release", ownerId: "preview-b" }), null);
});

test("suppresses hover audio for main-player embeds that cannot be safely restored", () => {
  assert.match(
    previewAudioSuppressionReason({ platform: "tiktok", format: "short" }) ?? "",
    /TikTok.*cannot be safely lowered and restored/,
  );
  assert.match(
    previewAudioSuppressionReason({ platform: "instagram", format: "long" }) ?? "",
    /Instagram.*cannot be safely lowered and restored/,
  );
  assert.equal(previewAudioSuppressionReason({ platform: "instagram", format: "photo" }), null);
  assert.equal(previewAudioSuppressionReason({ platform: "youtube", format: "long" }), null);
  assert.equal(previewAudioSuppressionReason(null), null);
});
