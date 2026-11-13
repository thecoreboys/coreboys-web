import assert from "node:assert/strict";
import test from "node:test";
import {
  presetNormalizedRects,
  resizeRoomTileEdge,
  roomLayoutHasCollisions,
  swapRoomTiles,
  theaterRoomFrame,
  type RoomLayoutTile,
} from "../lib/watch/room-layout";

function tiles(rects: Array<[number, number, number, number]>, density = 12): RoomLayoutTile[] {
  return rects.map(([x, y, w, h], index) => ({
    id: `t${index}`,
    rect: { x: x / density, y: y / density, width: w / density, height: h / density },
  }));
}

function units(layout: RoomLayoutTile[] | null, density = 12) {
  assert.ok(layout, "expected a valid layout");
  return layout.map((tile) => [
    Math.round(tile.rect.x * density),
    Math.round(tile.rect.y * density),
    Math.round(tile.rect.width * density),
    Math.round(tile.rect.height * density),
  ]);
}

test("dragging a shared seam resizes both neighbours and leaves no gap", () => {
  const pair = tiles([[0, 0, 7, 12], [7, 0, 5, 12]]);
  assert.deepEqual(units(resizeRoomTileEdge(pair, "t0", "right", 5 / 12)), [[0, 0, 5, 12], [5, 0, 7, 12]]);
  // The right-hand view resizes from its left seam.
  assert.deepEqual(units(resizeRoomTileEdge(pair, "t1", "left", 8 / 12)), [[0, 0, 8, 12], [8, 0, 4, 12]]);
});

test("a seam shared by a whole column moves every tile along it", () => {
  // Theater main with two stacked companions.
  const theater = tiles([[0, 0, 8, 12], [8, 0, 4, 6], [8, 6, 4, 6]]);
  assert.deepEqual(
    units(resizeRoomTileEdge(theater, "t0", "right", 9 / 12)),
    [[0, 0, 9, 12], [9, 0, 3, 6], [9, 6, 3, 6]],
  );
  // In a 2 × 2 grid each row's seam is its own; the other row stays put.
  const grid = tiles([[0, 0, 6, 6], [6, 0, 6, 6], [0, 6, 6, 6], [6, 6, 6, 6]]);
  const resized = resizeRoomTileEdge(grid, "t0", "right", 4 / 12);
  assert.deepEqual(units(resized), [[0, 0, 4, 6], [4, 0, 8, 6], [0, 6, 6, 6], [6, 6, 6, 6]]);
  // A companion spanning both rows pulls both left-hand tiles along.
  const spanning = tiles([[0, 0, 6, 6], [0, 6, 6, 6], [6, 0, 6, 12]]);
  assert.deepEqual(units(resizeRoomTileEdge(spanning, "t0", "right", 8 / 12)), [[0, 0, 8, 6], [0, 6, 8, 6], [8, 0, 4, 12]]);
  assert.equal(roomLayoutHasCollisions(resized!), false);
});

test("seam resizing grows into free space and refuses impossible sizes", () => {
  const loose = tiles([[0, 0, 4, 4], [8, 0, 4, 4]]);
  assert.deepEqual(units(resizeRoomTileEdge(loose, "t0", "right", 6 / 12)), [[0, 0, 6, 4], [8, 0, 4, 4]]);
  assert.deepEqual(units(resizeRoomTileEdge(loose, "t0", "bottom", 10 / 12)), [[0, 0, 4, 10], [8, 0, 4, 4]]);
  // Growing into a non-adjacent tile would overlap it.
  assert.equal(resizeRoomTileEdge(loose, "t0", "right", 10 / 12), null);
  // A neighbour can never be squeezed below one cell.
  const pair = tiles([[0, 0, 7, 12], [7, 0, 5, 12]]);
  assert.equal(resizeRoomTileEdge(pair, "t0", "right", 1), null);
  assert.equal(resizeRoomTileEdge(pair, "nope", "right", 0.5), null);
});

test("every preset stays full after a seam resize", () => {
  for (const preset of ["theater-first", "split", "quad", "main-three", "focus-side"] as const) {
    for (let count = 2; count <= 6; count += 1) {
      const layout = presetNormalizedRects(preset, count).map((rect, index) => ({ id: `t${index}`, rect }));
      const resized = resizeRoomTileEdge(layout, "t0", "right", layout[0]!.rect.x + layout[0]!.rect.width - 1 / 12);
      if (!resized) continue;
      const area = (list: RoomLayoutTile[]) => list.reduce((sum, tile) => sum + tile.rect.width * tile.rect.height, 0);
      assert.ok(Math.abs(area(resized) - area(layout)) < 1e-6 || area(resized) <= area(layout), `${preset}/${count}`);
      assert.equal(roomLayoutHasCollisions(resized), false, `${preset}/${count}`);
    }
  }
});

test("swapping exchanges exactly two rectangles", () => {
  const layout = tiles([[0, 0, 8, 12], [8, 0, 4, 6], [8, 6, 4, 6]]);
  assert.deepEqual(units(swapRoomTiles(layout, "t0", "t2")), [[8, 6, 4, 6], [8, 0, 4, 6], [0, 0, 8, 12]]);
  assert.deepEqual(units(swapRoomTiles(layout, "t0", "missing")), units(layout));
});

test("the Studio frame mirrors the desktop room's stage and chat column", () => {
  const frame = theaterRoomFrame({ width: 1890, height: 904 }, { side: 360, bottom: 320 }, "right");
  assert.equal(frame.sideColumn, true);
  assert.equal(frame.container, 1880 - 56);
  assert.equal(frame.side, 360);
  assert.equal(frame.stage, 1824 - 360 - 12);
  assert.equal(frame.bottom, 0);
  // The chat column never drops below 17.5rem or above 36vw.
  assert.equal(theaterRoomFrame({ width: 1200, height: 800 }, { side: 520, bottom: 320 }, "left").side, 432);
  assert.equal(theaterRoomFrame({ width: 1200, height: 800 }, { side: 200, bottom: 320 }, "left").side, 280);
  // Bottom chat is capped at 48% of the window height.
  assert.equal(theaterRoomFrame({ width: 1600, height: 800 }, { side: 360, bottom: 560 }, "bottom").bottom, 384);
  // Below the lg breakpoint chat sits under the stage.
  const tablet = theaterRoomFrame({ width: 900, height: 1000 }, { side: 360, bottom: 300 }, "right");
  assert.equal(tablet.sideColumn, false);
  assert.equal(tablet.stage, tablet.container);
  assert.equal(tablet.bottom, 300);
});
