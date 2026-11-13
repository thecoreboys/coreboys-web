import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MINI_PLAYER_NUDGE,
  clampMiniPlayerPoint,
  miniPlayerBounds,
  miniPlayerPlacementFromPoint,
  miniPlayerPointFromPlacement,
  miniPlayerSide,
  nudgeMiniPlayerPoint,
  parseMiniPlayerPlacement,
  serializeMiniPlayerPlacement,
  snapMiniPlayerPoint,
} from "../lib/watch/mini-player-position";

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const mini = { width: 400, height: 300 };
const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

test("mini player bounds keep clear of the header, bottom nav and safe areas", () => {
  const bounds = miniPlayerBounds(phone, { width: 366, height: 290 }, { top: 64, right: 0, bottom: 106, left: 0 });
  assert.deepEqual(bounds, { minLeft: 12, maxLeft: 12, minTop: 76, maxTop: 844 - 106 - 12 - 290 });
  const clamped = clampMiniPlayerPoint({ left: -50, top: 2000 }, bounds);
  assert.deepEqual(clamped, { left: 12, top: bounds.maxTop });
});

test("a player taller than the room stays bottom-docked instead of hiding under the nav", () => {
  const bounds = miniPlayerBounds({ width: 844, height: 390 }, { width: 240, height: 500 }, { top: 60, right: 0, bottom: 72, left: 0 });
  assert.equal(bounds.minTop, bounds.maxTop);
  assert.equal(clampMiniPlayerPoint({ left: 100, top: 0 }, bounds).top, bounds.maxTop);
});

test("placements are stored as ratios, so a corner stays a corner after resize or rotation", () => {
  const wide = miniPlayerBounds(desktop, mini, noInsets);
  const placement = miniPlayerPlacementFromPoint({ left: wide.maxLeft, top: wide.minTop }, wide);
  assert.deepEqual(placement, { x: 1, y: 0 });
  const narrow = miniPlayerBounds(phone, { width: 240, height: 200 }, noInsets);
  assert.deepEqual(miniPlayerPointFromPlacement(placement, narrow), { left: narrow.maxLeft, top: narrow.minTop });
  assert.deepEqual(miniPlayerSide(placement), { vertical: "top", horizontal: "right" });
  assert.deepEqual(miniPlayerSide(null), { vertical: "bottom", horizontal: "left" });
});

test("release snaps magnetically to a nearby edge but otherwise stays where it was dropped", () => {
  const bounds = miniPlayerBounds(desktop, mini, noInsets);
  assert.deepEqual(snapMiniPlayerPoint({ left: bounds.minLeft + 20, top: bounds.maxTop - 10 }, bounds), { left: bounds.minLeft, top: bounds.maxTop });
  assert.deepEqual(snapMiniPlayerPoint({ left: 500, top: 300 }, bounds), { left: 500, top: 300 });
});

test("arrow keys nudge the mini player and Shift jumps to an edge", () => {
  const bounds = miniPlayerBounds(desktop, mini, noInsets);
  const start = { left: 500, top: 300 };
  assert.deepEqual(nudgeMiniPlayerPoint(start, "ArrowRight", false, bounds), { left: 500 + MINI_PLAYER_NUDGE, top: 300 });
  assert.deepEqual(nudgeMiniPlayerPoint(start, "ArrowUp", true, bounds), { left: 500, top: bounds.minTop });
  assert.equal(nudgeMiniPlayerPoint(start, "Enter", false, bounds), null);
});

test("stored placements are validated and versioned", () => {
  assert.deepEqual(parseMiniPlayerPlacement(serializeMiniPlayerPlacement({ x: 0.25, y: 0.75 })), { x: 0.25, y: 0.75 });
  assert.deepEqual(parseMiniPlayerPlacement('{"v":1,"x":4,"y":-2}'), { x: 1, y: 0 });
  assert.equal(parseMiniPlayerPlacement('{"x":0.5,"y":0.5}'), null);
  assert.equal(parseMiniPlayerPlacement("not json"), null);
  assert.equal(parseMiniPlayerPlacement(null), null);
});

test("every player surface can send media to the draggable mini player", () => {
  const persistent = readFileSync("components/watch/PersistentPlayer.tsx", "utf8");
  assert.match(persistent, /useMiniPlayerDrag\(\s*playerSectionRef/);
  assert.match(persistent, /onPointerDown=\{playerScreen \? undefined : miniDrag\.onPointerDown\}/);
  assert.match(persistent, /aria-label="Move mini player"/);
  assert.match(persistent, /aria-label="Minimize player"/);

  const hook = readFileSync("hooks/useMiniPlayerDrag.ts", "utf8");
  assert.match(hook, /prefersMinimalMotion\(\) \? "none"/);
  assert.match(hook, /translate3d\(/);
  assert.match(hook, /--mobile-nav-space/);
  assert.match(hook, /--site-header-h/);
  assert.doesNotMatch(hook, /style\.(left|top) =/);

  const multiview = readFileSync("components/watch/MultiPlayerStage.tsx", "utf8");
  assert.match(multiview, /const miniPlayerTile = focused \?\? mainTile/);
  assert.match(multiview, /player\.minimize\(\);/);

  const network = readFileSync("components/watch/NetworkChannelPage.tsx", "utf8");
  assert.match(network, /onMiniPlayer=\{\(\) => \{/);
});
