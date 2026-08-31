import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const poster = source("components/watch/PosterCard.tsx");
const preview = source("components/watch/HoverPreview.tsx");
const home = source("components/watch/WatchHome.tsx");

test("the home short-form rail warms upcoming preview resources without eager embeds", () => {
  assert.match(home, /title="Shorts, reels & TikToks"[\s\S]{0,180}preloadUpcoming/);
  assert.match(poster, /rootMargin:\s*"0px 140% 0px 20%"/);
  assert.match(poster, /item\.platform === "instagram" \|\| item\.platform === "tiktok"/);
  assert.match(poster, /warmHoverStill\(item, false\)/);
  assert.match(poster, /preconnectHoverEmbed\(item/);
  assert.doesNotMatch(poster, /documentHint\.rel\s*=\s*"prefetch"/);
});

test("preview warming is bounded and honors bandwidth and motion preferences", () => {
  assert.match(poster, /MAX_WARMED_HOVER_ORIGINS\s*=\s*6/);
  assert.match(poster, /MAX_WARMED_HOVER_STILLS\s*=\s*10/);
  assert.match(poster, /connection\?\.saveData\s*===\s*true/);
  assert.match(poster, /\["slow-2g", "2g"\]/);
  assert.match(poster, /prefers-reduced-motion:\s*reduce/);
  assert.match(poster, /player\.previewAutoplay\s*\|\|\s*hoverAutoplay/);
});

test("pointer, hover, and keyboard intent reuse one preloaded media preview", () => {
  assert.match(poster, /onMouseEnter=\{\(\)\s*=>\s*\{[\s\S]{0,100}showPreview\(false\)/);
  assert.match(poster, /onPointerEnter=\{\(\)\s*=>\s*\{[\s\S]{0,100}showPreview\(false\)/);
  assert.match(poster, /onFocusCapture=\{\(\)\s*=>\s*\{[\s\S]{0,100}showPreview\(true\)/);
  assert.match(poster, /setPreview\(true\);[\s\S]{0,160}openTimer\.current\s*=\s*window\.setTimeout/);
  assert.match(poster, /preloadOnly=\{!previewVisible && !previewClosing\}/);
  assert.match(preview, /autoplay:\s*item\.platform\s*===\s*"twitch"/);
  assert.match(preview, /if \(!active \|\| !iframeSrc \|\| playbackStartedRef\.current\) return/);
});

test("Instagram Reel frames reveal after provider load without fabricating progress", () => {
  assert.match(preview, /playable\?\.platform === "twitch" \|\| playable\?\.platform === "instagram"/);
  assert.match(preview, /playable\.platform === "instagram" \? 280 : 220/);
  assert.match(preview, /setReadyMotionSource\(iframeSrc\)/);
  assert.doesNotMatch(
    preview,
    /playable\?\.platform === "instagram"[\s\S]{0,500}playbackStartedRef\.current\s*=\s*true/,
  );
});
