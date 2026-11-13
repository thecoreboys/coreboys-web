import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const stage = readFileSync(
  resolve(process.cwd(), "components/watch/MultiPlayerStage.tsx"),
  "utf8",
);

test("multiview keeps provider frames stable when a player is promoted", () => {
  const tileSurface = stage.slice(
    stage.indexOf("const PlayerTileSurface = memo"),
    stage.indexOf("function TileButton"),
  );

  assert.match(tileSurface, /const PlayerTileSurface = memo/);
  assert.match(tileSurface, /onDoubleClick=\{\(\) => player\.focusTile\(tile\.id, \{ takeAudio: false \}\)\}/);
  assert.match(tileSurface, /if \(!maximized\) player\.focusTile\(tile\.id, \{ takeAudio: false \}\)/);
  assert.doesNotMatch(tileSurface, /key=\{`\$\{tile\.item\.key\}:\$\{tile\.muted\}/);
});

test("multiview defers nonessential tile work while a tile is offscreen", () => {
  const tileSurface = stage.slice(
    stage.indexOf("const PlayerTileSurface = memo"),
    stage.indexOf("function TileButton"),
  );

  assert.match(tileSurface, /new IntersectionObserver/);
  assert.match(tileSurface, /rootMargin: "180px 0px"/);
  assert.match(tileSurface, /!inViewport \|\| document\.visibilityState !== "visible"/);
});

test("the details panel focuses without silently taking room audio", () => {
  const details = stage.slice(stage.indexOf("function DetailsPanel"), stage.indexOf("function EmptyStage"));
  const makeMain = details.slice(details.indexOf("const makeFocusedMain"), details.indexOf("if (!focused) {"));
  assert.match(makeMain, /player\.makeMain\(focused\.id, \{ takeAudio: false \}\)/);
  assert.doesNotMatch(makeMain, /takeAudio: true/);
  assert.match(details, /focused\.muted \? player\.focusTile\(focused\.id, \{ takeAudio: true \}\)/);
});

test("browsing a chat channel leaves the main video and audio alone", () => {
  const chatFocus = stage.slice(stage.indexOf("const focusChatChannel"), stage.indexOf("const needle"));
  assert.doesNotMatch(chatFocus, /player\.(?:focusTile|makeMain|updateTile)\(/);
});

test("Twitch room audio changes use the SDK without rebuilding its frame", () => {
  const twitch = readFileSync(resolve(process.cwd(), "components/watch/TwitchTileMedia.tsx"), "utf8");
  assert.match(twitch, /\}, \[attempt, channel, id, video\]\)/);
  assert.match(twitch, /playerRef\.current\?\.setMuted\?\.\(muted\)/);
  assert.match(twitch, /playerRef\.current\?\.setVolume\?\.\(volume\)/);
  assert.match(twitch, /api\.Player\.PAUSE/);
  assert.match(twitch, /instance\.getCurrentTime\(\)/);
  assert.doesNotMatch(stage, /playingRef\.current = true;\s*\}\s*\}\}\s*className=\{`pointer-events-auto/);
});

test("YouTube room audio uses player commands and keeps its autoplay URL muted", () => {
  assert.match(stage, /autoplay: true,\s*muted: true/);
  assert.match(stage, /func: tile\.muted \? "mute" : "unMute"/);
  assert.match(stage, /func: "setVolume", args: \[Math\.round\(tile\.volume \* 100\)\]/);
});

test("multiview collapses same-creator Twitch and YouTube simulcasts and offers source switching", () => {
  assert.match(stage, /uniqueCrossPlatformLiveSources\(currentLive\)/);
  assert.match(stage, /groupCrossPlatformLiveSources/);
  assert.match(stage, /player\.replaceTile\(selectedTileId, item\)/);
  assert.match(stage, /Make \$\{group\.memberLabel\} on \$\{platformLabel\(item\)\} the main view/);
  assert.match(stage, /Older saved rooms can already contain both sides of a YouTube\/Twitch/);
  assert.match(stage, /openTiles\.find\(\(tile\) => tile\.pinned\)/);
  assert.match(stage, /player\.removeTile\(tile\.id\)/);
});
