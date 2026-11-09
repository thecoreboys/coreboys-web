import assert from "node:assert/strict";
import test from "node:test";
import { clearPlayerSurface } from "../lib/watch/player-clearance";

const player = { left: 569, top: 192, right: 1227, bottom: 562 };
test("DJ clears the live hero without covering the navigation", () => {
  const position = clearPlayerSurface({ x: 752, y: 548 }, 512, 156, player,
    { width: 1280, height: 720, top: 106 });
  assert.deepEqual(position, { x: 41, y: 122 });
});
test("controls keep their chosen position when playback is already clear", () => {
  const position = { x: 752, y: 800 };
  assert.equal(clearPlayerSurface(position, 512, 156, player,
    { width: 1280, height: 1080, top: 106 }), position);
});
test("a player moving under floating controls moves them below it when space permits", () => {
  assert.deepEqual(clearPlayerSurface({ x: 752, y: 480 }, 512, 156, player,
    { width: 1280, height: 900, top: 106 }), { x: 752, y: 578 });
});
