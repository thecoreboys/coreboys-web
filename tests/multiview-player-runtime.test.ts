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
  assert.match(details, /player\.focusTile\(focused\.id, \{ takeAudio: false \}\)/);
  assert.doesNotMatch(details, /player\.focusTile\(focused\.id, \{ takeAudio: true \}\)/);
});
