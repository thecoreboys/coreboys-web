import assert from "node:assert/strict";
import test from "node:test";
import {
  moveAndResolveRoomLayout,
  presetNormalizedRects,
  resolvePresetRoomLayout,
  roomLayoutMatchesPreset,
  roomLayoutHasCollisions,
  solveRoomLayout,
  type RoomLayoutPreset,
} from "../lib/watch/room-layout";
import {
  decodeWorkspace,
  encodeWorkspace,
  normalizeWorkspace,
  positionsForPreset,
} from "../lib/watch/workspace";
import { workspaceRestoreSettings } from "../components/providers/PlayerProvider";

const presets: RoomLayoutPreset[] = [
  "theater-first",
  "solo",
  "split",
  "quad",
  "main-three",
  "three-two",
  "portrait-wall",
  "chat-first",
  "freeform",
];

function playable(key: string) {
  return {
    key,
    kind: "live" as const,
    platform: "twitch" as const,
    title: `${key} live`,
    poster: "",
    memberSlug: key,
    memberLabel: key,
    youtubeId: null,
    twitchLogin: key,
    vodId: null,
    clipSrc: null,
    clipId: null,
    url: `https://twitch.tv/${key}`,
    embeddable: true,
    orientation: "landscape" as const,
  };
}

function v2Tile(id: string, col = 1, row = 1, colSpan = 6, rowSpan = 2) {
  return {
    id,
    item: playable(id),
    col,
    row,
    colSpan,
    rowSpan,
    muted: true,
    volume: 0.8,
    pinned: false,
    fit: "contain" as const,
    standby: false,
    delaySeconds: 0,
  };
}

test("every room preset is bounded and collision-free from one through twelve tiles", () => {
  for (const preset of presets) {
    for (let count = 1; count <= 12; count += 1) {
      const rects = presetNormalizedRects(preset, count);
      assert.equal(rects.length, count, `${preset} should retain ${count} tiles`);
      const tiles = rects.map((rect, index) => ({ id: `${preset}-${index}`, rect }));
      assert.equal(roomLayoutHasCollisions(tiles), false, `${preset} should have no collisions at ${count}`);
      for (const tile of tiles) {
        assert.ok(tile.rect.x >= 0 && tile.rect.y >= 0, `${preset} starts within board`);
        assert.ok(tile.rect.x + tile.rect.width <= 1, `${preset} ends within board width`);
        assert.ok(tile.rect.y + tile.rect.height <= 1, `${preset} ends within board height`);
      }
    }
  }
});

test("preset geometry stays bounded and collision-free on every saved snap density", () => {
  for (const density of [4, 5, 8, 12, 16, 24]) {
    for (const preset of presets) {
      for (let count = 1; count <= 12; count += 1) {
        const rects = presetNormalizedRects(preset, count, density);
        assert.equal(
          roomLayoutHasCollisions(rects.map((rect, index) => ({ id: `${preset}-${density}-${index}`, rect }))),
          false,
          `${preset} should be collision-free on an ${density}-cell board`,
        );
        for (const rect of rects) {
          for (const value of Object.values(rect)) {
            assert.ok(Math.abs(value * density - Math.round(value * density)) < 0.0001, `${preset} should stay on the ${density}-cell snap grid`);
          }
        }
      }
    }
  }
});

test("Theater runtime resolver preserves direct geometry and promotes the focused source on an untouched preset", () => {
  const ids = ["first", "second"];
  const canonical = presetNormalizedRects("theater-first", ids.length, 12);
  const stored = ids.map((id, index) => ({ id, rect: canonical[index]! }));

  assert.equal(roomLayoutMatchesPreset("theater-first", stored, 12), true);
  const focusedSecond = resolvePresetRoomLayout("theater-first", stored, {
    focusedId: "second",
    snapDensity: 12,
  });
  assert.deepEqual(focusedSecond.find((tile) => tile.id === "second")?.rect, canonical[0]);
  assert.deepEqual(focusedSecond.find((tile) => tile.id === "first")?.rect, canonical[1]);

  const customized = [
    { id: "first", rect: { x: 0, y: 0, width: 0.5, height: 1 } },
    { id: "second", rect: { x: 0.5, y: 0, width: 0.5, height: 1 } },
  ];
  assert.equal(roomLayoutMatchesPreset("theater-first", customized, 12), false);

  const twitchSafe = resolvePresetRoomLayout("theater-first", stored, {
    focusedId: "first",
    snapDensity: 12,
    twitchSafeTheaterPair: true,
  });
  const main = twitchSafe.find((tile) => tile.id === "first")!.rect;
  const companion = twitchSafe.find((tile) => tile.id === "second")!.rect;
  assert.ok(main.width > companion.width, "the Twitch-safe pair keeps a dominant main source");
  assert.equal(roomLayoutHasCollisions(twitchSafe), false);
});

test("legacy grid projections use the snapshot's own snap density", () => {
  const positions = positionsForPreset("theater-first", 4, 8);
  const rects = positions.map((position) => ({
    id: `${position.col}-${position.row}`,
    rect: {
      x: (position.col - 1) / 8,
      y: (position.row - 1) / 8,
      width: position.colSpan / 8,
      height: position.rowSpan / 8,
    },
  }));
  assert.equal(roomLayoutHasCollisions(rects), false);
  assert.deepEqual(rects[0]?.rect, presetNormalizedRects("theater-first", 4, 8)[0]);
});

test("theater-first reserves the cinematic main surface before the companion rail", () => {
  const rects = presetNormalizedRects("theater-first", 4);

  assert.deepEqual(rects[0], { x: 0, y: 0, width: 0.75, height: 1 });
  assert.deepEqual(rects.slice(1), [
    { x: 0.75, y: 0, width: 0.25, height: 0.333333 },
    { x: 0.75, y: 0.333333, width: 0.25, height: 0.333333 },
    { x: 0.75, y: 0.666667, width: 0.25, height: 0.333333 },
  ]);
  assert.equal(
    roomLayoutHasCollisions(rects.map((rect, index) => ({ id: `theater-${index}`, rect }))),
    false,
  );
});

test("solver keeps the requested tile in place and deterministically repacks collisions", () => {
  const source = [
    { id: "first", rect: { x: 0, y: 0, width: 0.5, height: 0.5 } },
    { id: "dragged", rect: { x: 0, y: 0, width: 0.5, height: 0.5 } },
    { id: "third", rect: { x: 0, y: 0, width: 0.5, height: 0.5 } },
  ];
  const resolved = solveRoomLayout(source, { snapDensity: 8, anchorId: "dragged" });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.rejectedIds.length, 0);
  assert.equal(roomLayoutHasCollisions(resolved.tiles), false);
  assert.deepEqual(resolved.tiles.find((tile) => tile.id === "dragged")?.rect, source[1]?.rect);

  const moved = moveAndResolveRoomLayout(resolved.tiles, "third", { x: 0.5, y: 0.5 }, { snapDensity: 8 });
  assert.equal(moved.valid, true);
  assert.equal(roomLayoutHasCollisions(moved.tiles), false);
  assert.deepEqual(moved.tiles.find((tile) => tile.id === "third")?.rect, {
    x: 0.5,
    y: 0.5,
    width: 0.5,
    height: 0.5,
  });
});

test("drag collision repair is snapped, stable, and repeatable", () => {
  const source = presetNormalizedRects("quad", 4).map((rect, index) => ({
    id: `tile-${index}`,
    rect,
  }));

  // The requested position overlaps tile-0. The drag anchor should land on a
  // logical grid cell while every other source is deterministically repacked.
  const first = moveAndResolveRoomLayout(
    source,
    "tile-3",
    { x: 0.03, y: 0.04, width: 0.47, height: 0.48 },
    { snapDensity: 8 },
  );
  const second = moveAndResolveRoomLayout(
    source,
    "tile-3",
    { x: 0.03, y: 0.04, width: 0.47, height: 0.48 },
    { snapDensity: 8 },
  );
  const settled = solveRoomLayout(first.tiles, { snapDensity: 8, anchorId: "tile-3" });

  assert.equal(first.valid, true);
  assert.equal(roomLayoutHasCollisions(first.tiles), false);
  assert.deepEqual(first.tiles, second.tiles, "the same pointer operation produces the same room");
  assert.deepEqual(first.tiles, settled.tiles, "a settled room does not drift on the next solve");
  assert.deepEqual(first.tiles.find((tile) => tile.id === "tile-3")?.rect, {
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.5,
  });
  for (const tile of first.tiles) {
    for (const value of Object.values(tile.rect)) {
      assert.equal(Number.isInteger(value * 8), true, "all edited geometry stays on the snap grid");
    }
  }
});

test("v2 workspace migration creates a v3 normalized layout and migrates the legacy chat tile", () => {
  const normalized = normalizeWorkspace({
    version: 2,
    name: "Legacy studio",
    preset: "main-three",
    columns: 12,
    focusedTileId: "second",
    chatDock: "tile",
    chatChannels: ["one", "two"],
    chatMode: "columns",
    chatFocusedLogin: "one",
    chatTextScale: 1.1,
    showChatTimestamps: true,
    chatDockSize: {
      side: 368,
      bottom: 360,
      floatingWidth: 368,
      floatingHeight: 520,
      floatingX: 24,
      floatingY: 24,
    },
    // Intentional overlap and a large span exercise the repair path.
    tiles: [v2Tile("first", 1, 1, 12, 12), v2Tile("second", 1, 1, 12, 12)],
    updatedAt: "2026-08-24T00:00:00.000Z",
  });
  assert.ok(normalized);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.chatDock, "right");
  assert.equal(normalized.snapDensity, 12);
  assert.equal(normalized.showChatTimestamps, true);
  assert.equal(normalized.tiles.length, 2, "migration keeps valid sources instead of dropping one");
  assert.equal(roomLayoutHasCollisions(normalized.tiles), false);
  assert.ok(normalized.chatFloatingRect.x > 0.7 && normalized.chatFloatingRect.x < 0.75);
  assert.equal(normalized.mixAudio, false);
  assert.equal(normalized.autoplayMode, "live-first");
});

test("legacy floating chat becomes a bounded normalized dock and keeps timestamps opt-in", () => {
  const normalized = normalizeWorkspace({
    version: 2,
    name: "Floating legacy room",
    preset: "split",
    columns: 12,
    focusedTileId: "only",
    chatDock: "floating",
    chatChannels: ["adapt"],
    chatMode: "combined",
    chatFocusedLogin: null,
    chatTextScale: 1,
    chatDockSize: {
      side: 368,
      bottom: 360,
      floatingWidth: 400,
      floatingHeight: 500,
      floatingX: 40,
      floatingY: 20,
    },
    tiles: [v2Tile("only")],
    updatedAt: "2026-08-24T00:00:00.000Z",
  });

  assert.ok(normalized);
  assert.equal(normalized.chatDock, "floating");
  assert.equal(normalized.showChatTimestamps, false);
  assert.deepEqual(normalized.chatFloatingRect, {
    x: 0.694444,
    y: 0.358025,
    width: 0.277778,
    height: 0.617284,
  });
});

test("v3 room geometry is authoritative, snapped, and defaults to Theater-first details", () => {
  const normalized = normalizeWorkspace({
    version: 3,
    name: "",
    columns: 12,
    focusedTileId: "hero",
    // Current malformed/missing values recover to the current Theater-first
    // experience rather than an invisible freeform room.
    tiles: [{
      ...v2Tile("hero", 1, 1, 1, 1),
      rect: { x: 0.48, y: 0.48, width: 0.53, height: 0.53 },
    }],
    updatedAt: "2026-08-24T00:00:00.000Z",
  });

  assert.ok(normalized);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.preset, "theater-first");
  assert.equal(normalized.chatDock, "right");
  assert.equal(normalized.showChatTimestamps, false);
  assert.equal(normalized.name, "Shared layout");
  assert.deepEqual(normalized.tiles[0]?.rect, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  assert.deepEqual(
    {
      col: normalized.tiles[0]?.col,
      row: normalized.tiles[0]?.row,
      colSpan: normalized.tiles[0]?.colSpan,
      rowSpan: normalized.tiles[0]?.rowSpan,
    },
    { col: 7, row: 7, colSpan: 6, rowSpan: 6 },
    "the legacy grid projection follows the normalized rectangle, not stale input coordinates",
  );
});

test("v3 workspace round-trips normalized geometry, dock coordinates, and room playback preferences", () => {
  const source = normalizeWorkspace({
    version: 3,
    name: "Theater room",
    preset: "theater-first",
    columns: 12,
    snapDensity: 8,
    focusedTileId: "main",
    chatDock: "floating",
    chatChannels: ["main"],
    chatMode: "combined",
    chatFocusedLogin: null,
    chatTextScale: 1,
    showChatTimestamps: false,
    chatDockSize: {
      side: 368,
      bottom: 360,
      floatingWidth: 420,
      floatingHeight: 460,
      floatingX: 20,
      floatingY: 20,
    },
    chatFloatingRect: { x: 0.5, y: 0.2, width: 0.3, height: 0.5 },
    mixAudio: true,
    maxActivePlayers: 3,
    autoplayMode: "keep-grid-full",
    dataSaver: true,
    captionsEnabled: true,
    playbackRate: 1.25,
    qualityPreference: "balanced",
    tiles: [
      { ...v2Tile("main", 1, 1, 8, 8), rect: { x: 0, y: 0, width: 0.75, height: 1 } },
      { ...v2Tile("side", 10, 1, 3, 8), rect: { x: 0.75, y: 0, width: 0.25, height: 1 } },
    ],
    updatedAt: "2026-08-24T00:00:00.000Z",
  });
  assert.ok(source);
  const decoded = decodeWorkspace(encodeWorkspace(source));
  assert.ok(decoded);
  assert.equal(decoded.version, 3);
  assert.equal(decoded.snapDensity, 8);
  assert.deepEqual(decoded.chatFloatingRect, { x: 0.5, y: 0.2, width: 0.3, height: 0.5 });
  assert.equal(decoded.mixAudio, true);
  assert.equal(decoded.maxActivePlayers, 3);
  assert.equal(decoded.autoplayMode, "keep-grid-full");
  assert.equal(decoded.dataSaver, true);
  assert.equal(decoded.captionsEnabled, true);
  assert.equal(decoded.playbackRate, 1.25);
  assert.equal(decoded.qualityPreference, "balanced");
  assert.equal(decoded.showChatTimestamps, false);
  assert.equal(roomLayoutHasCollisions(decoded.tiles), false);
});

test("an empty saved room still restores its complete room-wide configuration", () => {
  const emptyRoom = normalizeWorkspace({
    version: 3,
    name: "Chat-only room",
    preset: "chat-first",
    columns: 8,
    snapDensity: 8,
    focusedTileId: null,
    chatDock: "floating",
    chatChannels: ["adapt", "lacy", "silky"],
    chatMode: "focused",
    chatFocusedLogin: "lacy",
    chatTextScale: 1.35,
    showChatTimestamps: true,
    chatDockSize: {
      side: 420,
      bottom: 440,
      floatingWidth: 480,
      floatingHeight: 640,
      floatingX: 32,
      floatingY: 48,
    },
    chatFloatingRect: { x: 0.42, y: 0.16, width: 0.34, height: 0.62 },
    mixAudio: true,
    maxActivePlayers: 7,
    autoplayMode: "keep-grid-full",
    dataSaver: true,
    captionsEnabled: true,
    playbackRate: 1.5,
    qualityPreference: "balanced",
    tiles: [],
    updatedAt: "2026-08-24T00:00:00.000Z",
  });

  assert.ok(emptyRoom);
  assert.equal(emptyRoom.tiles.length, 0);

  // The provider must apply this projection even when there is no tile to
  // restore. This is the exact state session restore and imported layouts use.
  const restored = workspaceRestoreSettings(emptyRoom, 3);
  assert.deepEqual(restored, {
    preset: "chat-first",
    columns: 8,
    snapDensity: 8,
    chatDock: "floating",
    chatChannels: ["adapt", "lacy", "silky"],
    chatMode: "focused",
    chatFocusedLogin: "lacy",
    chatTextScale: 1.35,
    showChatTimestamps: true,
    chatDockSize: {
      side: 420,
      bottom: 440,
      floatingWidth: 480,
      floatingHeight: 640,
      floatingX: 32,
      floatingY: 48,
    },
    chatFloatingRect: { x: 0.42, y: 0.16, width: 0.34, height: 0.62 },
    mixAudio: true,
    maxActivePlayers: 3,
    autoplayMode: "keep-grid-full",
    dataSaver: true,
    captionsEnabled: true,
    playbackRate: 1.5,
    qualityPreference: "balanced",
  });
});
