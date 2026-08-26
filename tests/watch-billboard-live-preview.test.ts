import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const billboard = readFileSync(resolve(process.cwd(), "components/watch/Billboard.tsx"), "utf8");
const watchCss = readFileSync(resolve(process.cwd(), "app/watch/watch.css"), "utf8");
const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

test("hero carousel previews autoplay behind CORE-owned interaction controls", () => {
  assert.match(billboard, /\{playable && !heroPlayable \? \(\s*<button[\s\S]{0,180}watch-billboard-surface-action/);
  assert.match(billboard, /item\.platform === "youtube" && !playable\.youtubeId/);
  assert.match(billboard, /autoplay: true,[\s\S]{0,80}muted: true/);
  assert.match(billboard, /api\.Player\.READY[\s\S]{0,180}providerReady = true[\s\S]{0,180}requestPlayback\(\)/);
  assert.match(billboard, /instance\.addEventListener\(api\.Player\.PLAYING/);
  assert.match(billboard, /func: "mute"[\s\S]{0,240}func: "playVideo"/);
  assert.match(billboard, /void loadBillboardTwitch\(\)\.catch/);
  assert.match(billboard, /const maxPlaybackAttempts = 14/);
  assert.match(billboard, /PLAYBACK_BLOCKED[\s\S]{0,1400}schedulePlaybackRetries\(\[350, 900, 1_800, 3_000\]\)/);
  assert.match(billboard, /instance\?\.isPaused\?\.\(\) === false/);
  assert.match(billboard, /playbackWatchdog = window\.setInterval/);
  assert.match(watchCss, /\.watch-billboard-live-player\.is-preview[\s\S]{0,1300}pointer-events: none/);
  assert.match(watchCss, /\.watch-billboard-live-player\.is-preview[\s\S]{0,1600}iframe[\s\S]{0,120}pointer-events: none !important/);
  assert.match(watchCss, /\.watch-billboard-live-core-overlay[\s\S]{0,300}z-index: 4/);
  assert.match(watchCss, /data-preview-state="warming"/);
});

test("live previews keep browser-safe visibility and size gates", () => {
  assert.match(billboard, /width >= 400 && height >= 300/);
  assert.match(billboard, /visibleWidth \/ rect\.width >= 0\.85/);
  assert.match(billboard, /visibleHeight \/ rect\.height >= 0\.85/);
  assert.doesNotMatch(billboard, /getElementById\("watch-filters"\)/);
  assert.match(billboard, /const wantsAutoplay =[\s\S]{0,80}playerReady[\s\S]{0,180}!current[\s\S]{0,80}!dataSaver[\s\S]{0,80}slotFitsProvider[\s\S]{0,80}providerExposed[\s\S]{0,80}pageVisible/);
  assert.doesNotMatch(billboard, /current: activePlayer/);
  assert.match(watchCss, /\.watch-billboard-live-player\.is-preview[\s\S]{0,300}min-width: 400px[\s\S]{0,160}min-height: 300px/);
  assert.match(globalCss, /html:has\(\.watch-os\) \.grain-host,[\s\S]{0,120}\.scanlines[\s\S]{0,80}display: none/);
});
