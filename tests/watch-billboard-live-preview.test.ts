import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const billboard = source("components/watch/Billboard.tsx");
const hover = source("components/watch/HoverPreview.tsx");
const twitchHover = source("components/watch/TwitchHoverMedia.tsx");
const homeHero = billboard.slice(billboard.indexOf("export function Billboard({"));
const previewPlayer = billboard.slice(billboard.indexOf("function BillboardHeroPlayer("), billboard.indexOf("export function Billboard({"));

test("home hero opens the shared player only through viewer intent", () => {
  assert.match(homeHero, /const playable = useMemo\(\(\) => itemToPlayable\(item\)/);
  assert.match(homeHero, /const playInPlayer = \(\) => \{\s*if \(!playable\) return;\s*player\.play\(item\);/);
  assert.match(homeHero, /\{playable && !heroPlayable \? \(\s*<button[\s\S]{0,180}watch-billboard-surface-action/);
  assert.match(homeHero, /onClick=\{playInPlayer\}/);
  assert.match(homeHero, /onClick=\{\(event\) => \{\s*if \(!playable\) return;\s*event\.preventDefault\(\);\s*playInPlayer\(\);/);
  assert.equal((homeHero.match(/player\.play\(/g) ?? []).length, 1, "all hero playback must use the intent handler");
  assert.match(homeHero, /<BillboardHeroPlayer item=\{item\} playable=\{heroPlayable\} onOpen=\{playInPlayer\}/);
  assert.doesNotMatch(previewPlayer, /player\.play\(/);
});

test("hero keeps source fallbacks and accessible rotation separate from its preview", () => {
  const carousel = billboard.slice(billboard.indexOf("export function BillboardCarousel"), billboard.indexOf("function BillboardHeroPlayer("));
  assert.match(carousel, /slides\.length < 2 \|\| interactionPaused \|\| reducedMotion/);
  assert.match(carousel, /onFocusCapture=\{\(\) => setFocusPaused\(true\)\}/);
  assert.match(carousel, /onMouseEnter=\{\(\) => setHoverPaused\(true\)\}/);
  assert.match(carousel, /aria-selected=\{slideIndex === index\}/);
  assert.doesNotMatch(carousel, /player\.play\(|playInPlayer|autoplay|autoPlay/);
  assert.match(homeHero, /const fallbackHref = item\.sourceUrl \|\| item\.href/);
  assert.match(homeHero, /href=\{\(fallbackOnly \? fallbackHref : "#"\)/);
  assert.match(homeHero, /rel=\{fallbackOnly[\s\S]{0,100}"noopener noreferrer"/);
  assert.match(homeHero, /<WatchThumb[\s\S]{0,220}loading="eager"/);
});

test("the right-side hero preview starts muted and honors viewing preferences and provider exposure", () => {
  assert.match(previewPlayer, /watch-billboard-live-player is-preview/);
  assert.doesNotMatch(previewPlayer, /is-background/);
  assert.match(previewPlayer, /const wantsAutoplay =[\s\S]{0,400}!current[\s\S]{0,100}!dataSaver[\s\S]{0,100}previewAutoplay[\s\S]{0,100}!reducedMotion[\s\S]{0,100}slotFitsProvider[\s\S]{0,100}providerExposed[\s\S]{0,100}pageVisible/);
  assert.match(previewPlayer, /width >= 400 && height >= 300/);
  assert.match(previewPlayer, /visibleWidth \/ rect\.width >= 0\.85/);
  assert.match(previewPlayer, /visibleHeight \/ rect\.height >= 0\.85/);
  assert.match(previewPlayer, /muted: true,[\s\S]{0,100}controls: false,[\s\S]{0,100}autoplay: true/);
  assert.match(previewPlayer, /nativeVideoUrl && wantsAutoplay \? \(/);
  assert.match(previewPlayer, /instance\?\.destroy\?\.\(\)/);
});

test("active hover previews honor motion preferences and hand playback off to the shared player", () => {
  assert.match(hover, /const wantsMotion =[\s\S]{0,160}!player\.dataSaver[\s\S]{0,40}!reducedMotion/);
  assert.match(hover, /const twitchSource =[\s\S]{0,180}item\.embeddable !== false[\s\S]{0,160}item\.previewStrategy !== "external"[\s\S]{0,100}item\.previewStrategy !== "image"/);
  assert.match(hover, /active=\{active && !preloadOnly && !handedOff\}/);
  assert.match(hover, /if \(!active \|\| !iframeSrc \|\| playbackStartedRef\.current\) return/);
  assert.match(hover, /if \(!active\) \{\s*video\.pause\(\);/);
  assert.match(hover, /video\.muted = true/);
});

test("the mounted Twitch hover player stays muted, visible, and bounded by provider readiness", () => {
  assert.match(twitchHover, /autoplay: false, muted: true/);
  assert.match(twitchHover, /channel \? \{ channel \} : \{ video: video\?\.startsWith\("v"\)/);
  assert.match(twitchHover, /if \(disposed \|\| !ready \|\| !instance \|\| !budget\.takeAttempt\(\)\) return/);
  assert.match(twitchHover, /current\.current\.active && inView && document\.visibilityState === "visible"/);
  assert.match(twitchHover, /instance\.addEventListener\(api\.Player\.READY/);
  assert.match(twitchHover, /instance\.setMuted\?\.\(true\)/);
  assert.match(twitchHover, /observedTwitchLivePlayback\(providerPlaying, paused, instance\.getPlaybackStats\?\.\(\)\)/);
  assert.match(twitchHover, /advancingTwitchPlayback\(previousPosition, position, paused\)/);
  assert.match(twitchHover, /window\.clearInterval\(poll\)/);
  assert.match(twitchHover, /visibilityObserver\.disconnect\(\)/);
  assert.match(twitchHover, /instance\?\.pause\?\.\(\); instance\?\.destroy\?\.\(\)/);
});
