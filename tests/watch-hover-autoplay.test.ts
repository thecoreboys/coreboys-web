import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// Node's type-stripping test runner requires the explicit TypeScript suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { contentShape, embedFor, type Playable } from "../lib/watch/playable.ts";

const preview = readFileSync(
  resolve(process.cwd(), "components/watch/HoverPreview.tsx"),
  "utf8",
);

function youtubePlayable(format: "long" | "short"): Playable {
  return {
    key: `youtube-${format}`,
    kind: "youtube",
    platform: "youtube",
    title: `YouTube ${format}`,
    poster: "/poster.jpg",
    memberSlug: "ron",
    memberLabel: "StableRonaldo",
    youtubeId: format === "short" ? "shortVideo1" : "wideVideo01",
    twitchLogin: null,
    vodId: null,
    clipSrc: null,
    clipId: null,
    url: null,
    sourceUrl: format === "short"
      ? "https://www.youtube.com/shorts/shortVideo1"
      : "https://www.youtube.com/watch?v=wideVideo01",
    embeddable: true,
    orientation: format === "short" ? "portrait" : "landscape",
    format,
  };
}

test("portrait and landscape hover media both request muted autoplay", () => {
  const landscape = youtubePlayable("long");
  const portrait = youtubePlayable("short");

  assert.equal(contentShape(landscape), "landscape");
  assert.equal(contentShape(portrait), "portrait");

  for (const item of [landscape, portrait]) {
    const source = embedFor(item, {
      parent: "core.test",
      origin: "https://core.test",
      autoplay: true,
      muted: true,
      controls: false,
    });
    assert.ok(source, `${item.format} hover preview should have playable media`);
    const url = new URL(source);
    assert.equal(url.searchParams.get("autoplay"), "1");
    assert.equal(url.searchParams.get("mute"), "1");
  }

  const nativeTag = /<video[\s\S]*?\/>/.exec(preview)?.[0] ?? "";
  const frameTag = /<iframe[\s\S]*?\/>/.exec(preview)?.[0] ?? "";
  assert.match(nativeTag, /\bautoPlay\b/);
  assert.match(nativeTag, /\bmuted\b/);
  assert.match(nativeTag, /\bplaysInline\b/);
  assert.match(frameTag, /allow="[^"]*autoplay/);
});

test("hover frames actively request provider playback instead of trusting iframe load", () => {
  assert.match(preview, /playVideo/);
  assert.match(preview, /x-tiktok-player[\s\S]{0,160}type:\s*"play"/);
  assert.match(preview, /x-tiktok-player[\s\S]{0,160}type:\s*"mute"/);

  const frameTag = /<iframe[\s\S]*?\/>/.exec(preview)?.[0] ?? "";
  assert.doesNotMatch(
    frameTag,
    /onLoad=\{\(\)\s*=>\s*setReadyMotionSource/,
    "loading a provider document is not evidence that its video started",
  );
});

test("native hover readiness and progress begin only after play evidence", () => {
  const nativeTag = /<video[\s\S]*?\/>/.exec(preview)?.[0] ?? "";

  assert.match(nativeTag, /onPlay(?:ing)?=\{/);
  assert.doesNotMatch(
    nativeTag,
    /onLoadedData=\{[^}]*setReadyMotionSource/,
    "loaded data may still be a paused first frame",
  );
  assert.doesNotMatch(
    nativeTag,
    /onCanPlay=\{[\s\S]{0,180}setReadyMotionSource/,
    "canplay means buffered, not playing",
  );
  assert.match(preview, /playbackStartedRef/);
  assert.match(
    preview,
    /if\s*\(\s*!playbackStartedRef\.current\s*\)\s*return/,
    "timeupdate/currentTime must not animate preview progress while paused or blocked",
  );
});

test("provider progress requires an explicit playing state", () => {
  assert.match(preview, /sample\.playing/);
  assert.match(preview, /playbackStartedRef\.current\s*=\s*sample\.playing/);
  assert.match(
    preview,
    /if\s*\(\s*!playbackStartedRef\.current\s*\)\s*return/,
    "provider currentTime messages alone cannot prove playback",
  );
});

test("unsupported preview audio stays separate from autoplay state", () => {
  assert.match(preview, /PreviewAudioControl/);
  assert.match(preview, /ready=\{motionReady\}/);
  assert.doesNotMatch(
    preview,
    /(?:Audio unavailable|unavailableReason)[\s\S]{0,180}(?:setReadyMotionSource|playbackStartedRef\.current\s*=\s*true)/,
    "an unavailable sound toggle must never claim that muted video is playing",
  );
});
