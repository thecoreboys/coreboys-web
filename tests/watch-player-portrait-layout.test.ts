import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const player = readFileSync(
  resolve(process.cwd(), "components/watch/PersistentPlayer.tsx"),
  "utf8",
);

test("Guide details never widen the initial portrait Theater item", () => {
  const start = player.indexOf("const guideVodDetails = Boolean(");
  const end = player.indexOf("const cleanTwitchFrame", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(player.slice(start, end), /shape === "landscape"/);
  assert.match(player, /shape === "portrait"\s*\? "max-w-\[calc\(\(100dvh-8rem\)\*9\/16\)\]"/);
});
