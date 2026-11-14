import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { isValidElement, type ReactElement } from "react";
import ts from "typescript";
import * as geometry from "../lib/watch/room-layout";

const require = createRequire(import.meta.url);
const stageFile = resolve("components/watch/MultiPlayerStage.tsx");
const source = ts.createSourceFile(stageFile, readFileSync(stageFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the production components with inert media and measured DOM ports.
// This catches renderer wiring errors that geometry-only tests cannot detect.
function loadFunctions(names: string[], ports: Record<string, unknown>) {
  const declarations = names.map(name => {
    const declaration = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `Missing production function ${name}`);
    return declaration.getText(source);
  }).join("\n");
  const module = { exports: {} as Record<string, (props: Record<string, unknown>) => ReactElement> };
  const code = ts.transpileModule(`${declarations}\nexport { ${names.join(", ")} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require, ...geometry, ...ports }, { filename: stageFile });
  return module.exports;
}

function elements(element: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(element)) return element.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(element)) return [];
  return [element, ...elements(element.props.children)];
}

const presets = ["auto", "theater-first", "split", "focus-side", "grid"] as const;

function renderRoom(preset: geometry.RoomLayoutPreset, lockedCount: number, options: { twitch?: boolean; width?: number } = {}) {
  const tiles = ["first", "second"].map((id, index) => ({
    id,
    item: { platform: options.twitch ? "twitch" : "youtube", memberSlug: id, title: id },
    pinned: false,
    rect: geometry.presetNormalizedRects(preset, 2)[index]!,
  }));
  const lockedSlots = Array.from({ length: lockedCount }, (_, index) => ({ id: `locked-${index}`, ordinal: index + 3 }));
  const PlayerTile = () => null;
  const LockedLiveTile = () => null;
  const player = { layoutPreset: preset, snapDensity: 12, ambientLighting: false };
  const functions = loadFunctions(["mainRoomTile", "roomTileRect", "roomRectStyle", "roomTileStyle", "TheaterRoomSurface"], {
    usePlayer: () => player,
    useMemo: (read: () => unknown) => read(),
    useState: () => [options.width ?? 1920, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    MEMBERS: [],
    PlayerTile,
    LockedLiveTile,
    TileSwapProvider: "div",
  });
  const tree = functions.TheaterRoomSurface!({
    tiles, lockedSlots, focusedId: "first", activeIds: new Set(tiles.map(tile => tile.id)),
    maximizedTileId: null, passportCreditTileId: null, playableLimit: 2,
    onReplace() {}, feedbackFor: () => null, onFeedback() {},
  });
  return elements(tree).filter(element => element.type === PlayerTile || element.type === LockedLiveTile);
}

for (const preset of presets) {
  test(`${preset} reaches the rendered players and membership placeholders`, () => {
    for (const lockedCount of [0, 1, 3]) {
      const ids = ["first", "second", ...Array.from({ length: lockedCount }, (_, index) => `locked-${index}`)];
      const expected = geometry.resolvePresetRoomLayout(preset, ids.map(id => ({ id })), { focusedId: "first", snapDensity: 12 });
      const rendered = renderRoom(preset, lockedCount);
      assert.equal(rendered.length, ids.length);
      rendered.forEach((element, index) => {
        assert.equal(element.key, ids[index], "layout changes retain the provider tile identity");
        const position = geometry.normalizedRectToGridPosition(expected[index]!.rect, 12, 12);
        const style = element.props.style as Record<string, string>;
        assert.equal(style.gridColumn, `${position.col} / span ${position.colSpan}`);
        assert.equal(style.gridRow, `${position.row} / span ${position.rowSpan}`);
      });
    }
  });
}

test("Twitch minimum-size fallback uses the geometry displayed alongside locked slots", () => {
  const rendered = renderRoom("auto", 1, { twitch: true, width: 1200 });
  for (const element of rendered) {
    const style = element.props.style as Record<string, string>;
    assert.equal(style.gridColumn, "1 / -1");
    assert.equal(style.gridRow, "auto");
  }
});

function mountSidebar(viewportHeight: number) {
  let scrollTop = 0;
  let desktop = true;
  let disconnected = false;
  const listeners = new Map<string, () => void>();
  const effects: Array<() => void | (() => void)> = [];
  const style = { height: "", removeProperty() { this.height = ""; } };
  const room = {};
  const sidebar = { style, closest: () => room, getBoundingClientRect: () => ({ top: 212 - scrollTop }) };
  const window = {
    innerHeight: viewportHeight,
    matchMedia: () => ({ matches: desktop }),
    addEventListener: (event: string, callback: () => void) => listeners.set(event, callback),
    removeEventListener: (event: string) => listeners.delete(event),
  };
  let onResize: () => void = () => {};
  class ResizeObserver {
    constructor(callback: () => void) { onResize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const functions = loadFunctions(["WorkspaceSidebar"], {
    useRef: () => ({ current: sidebar }),
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
    window,
    document: { getElementById: () => ({ getBoundingClientRect: () => ({ height: 1100 }) }) },
    getComputedStyle: () => ({ top: "140px" }),
    ResizeObserver,
    RoomSidebarResize: "div",
    X: "span",
  });
  functions.WorkspaceSidebar!({ mobileOpen: false, activeTab: "chat", chat: "Synthetic chat" });
  const cleanup = effects.map(effect => effect());
  return {
    style,
    listeners,
    scroll(to: number) { scrollTop = to; onResize(); },
    resize(height: number, isDesktop = true) { window.innerHeight = height; desktop = isDesktop; listeners.get("resize")?.(); },
    dispose() { cleanup.forEach(dispose => dispose?.()); assert.equal(listeners.size, 0); assert.equal(disconnected, true); },
  };
}

test("desktop chat height stays constant when page scrolling changes its screen position", () => {
  const sidebar = mountSidebar(1080);
  try {
    const initial = sidebar.style.height;
    assert.equal(initial, "924px");
    for (const scrollTop of [100, 450, 900, 0]) {
      sidebar.scroll(scrollTop);
      assert.equal(sidebar.style.height, initial);
    }
  } finally { sidebar.dispose(); }
});

test("chat remains within short viewports and clears desktop sizing for the mobile sheet", () => {
  const sidebar = mountSidebar(400);
  try {
    assert.ok(Number.parseFloat(sidebar.style.height) <= 244, "chat must fit below its sticky header with a bottom gutter");
    sidebar.resize(320);
    assert.ok(Number.parseFloat(sidebar.style.height) <= 164);
    sidebar.resize(700, false);
    assert.equal(sidebar.style.height, "");
  } finally { sidebar.dispose(); }
});
