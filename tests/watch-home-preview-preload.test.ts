import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const poster = source("components/watch/PosterCard.tsx");
const preview = source("components/watch/HoverPreview.tsx");
const thumb = source("components/watch/WatchThumb.tsx");
const home = source("components/watch/WatchHome.tsx");

test("the home short-form rail warms upcoming preview resources without eager embeds", () => {
  assert.match(home, /title="Shorts, reels & TikToks"[\s\S]{0,180}preloadUpcoming/);
  assert.match(poster, /rootMargin:\s*"0px 140% 0px 20%"/);
  assert.match(poster, /item\.platform === "instagram" \|\| item\.platform === "tiktok"/);
  assert.match(poster, /warmHoverStill\(item, true\)/);
  assert.match(poster, /preconnectHoverEmbed\(item/);
  assert.doesNotMatch(poster, /documentHint\.rel\s*=\s*"prefetch"/);
});

test("the collapsed CORE library still shows a small content preview", () => {
  assert.match(home, /const libraryPreview = useMemo\(/);
  assert.match(home, /personalizeItems\(source\.filter\(\(item\) => !isLiveWatchItem\(item\)\), feedback\)/);
  assert.match(home, /if \(isLiveWatchItem\(item\) \|\| item\.format === "photo"\) return false/);
  assert.match(home, /filter\(\(item\) => !isLiveWatchItem\(item\) && !item\.programming\?\.community\)/);
  assert.match(home, /!showFullLibrary[\s\S]{0,300}From the library/);
  assert.match(home, /watch-library-empty[\s\S]{0,160}New videos, clips, and Shorts will show up here/);
});

test("preview warming is bounded and honors bandwidth and motion preferences", () => {
  assert.match(poster, /MAX_WARMED_HOVER_ORIGINS\s*=\s*6/);
  assert.match(poster, /MAX_WARMED_HOVER_STILLS\s*=\s*10/);
  assert.match(poster, /connection\?\.saveData\s*===\s*true/);
  assert.match(poster, /\["slow-2g", "2g"\]/);
  assert.match(poster, /prefers-reduced-motion:\s*reduce/);
  assert.match(poster, /player\.previewAutoplay\s*&&\s*hoverAutoplay/);
  assert.match(poster, /!avoidsMotionWarm\(player\.dataSaver, motionEnabled\)/);
});

test("social posters show a designed underlay while loading and warm near-visible covers at high priority", () => {
  assert.match(poster, /warmHoverStill\(item, true\)/);
  assert.match(poster, /placeholder=\{posterFallback\}/);
  assert.match(thumb, /!loaded \? <span className="watch-thumb-placeholder"/);
  assert.match(thumb, /placeholder && loaded \? "is-loaded"/);
  assert.match(home, /title="Shorts, reels & TikToks"/);
});

test("pointer and keyboard intent open one expanded autoplay preview", () => {
  assert.match(poster, /onMouseEnter=\{\(\)\s*=>\s*\{[\s\S]{0,100}showPreview\(false\)/);
  assert.match(poster, /onPointerEnter=\{\(\)\s*=>\s*\{[\s\S]{0,100}showPreview\(false\)/);
  assert.match(poster, /onFocusCapture=\{\(\)\s*=>\s*\{[\s\S]{0,100}showPreview\(true\)/);
  assert.match(poster, /setPreview\(true\);[\s\S]{0,160}openTimer\.current\s*=\s*window\.setTimeout/);
  assert.match(poster, /preloadOnly=\{!previewVisible && !previewClosing\}/);
  assert.match(home, /inlinePreview: false/);
  assert.match(preview, /autoplay:\s*true/);
  assert.match(preview, /if \(!mediaActive \|\| !iframeSrc \|\| playbackStartedRef\.current\) return/);
});

test("closed, handed-off, and hidden previews stop their media immediately", () => {
  assert.match(preview, /mediaActive = active && !preloadOnly && !handedOff && pageVisible/);
  assert.match(preview, /wantsMotion = mediaActive && player\.previewAutoplay && hoverAutoplay/);
  assert.match(preview, /visibilitychange/);
  assert.doesNotMatch(preview, /providerRevealTimerRef/);
});
