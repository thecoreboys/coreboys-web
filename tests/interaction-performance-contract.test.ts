import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const cursor = readFileSync(resolve(root, "components/editorial/Cursor.tsx"), "utf8");
const device = readFileSync(resolve(root, "lib/device-performance.ts"), "utf8");

test("custom cursor pointer-move handler avoids repeated target inspection", () => {
  const start = cursor.indexOf("const onMove = (event: PointerEvent) => {");
  const end = cursor.indexOf("const onDown =", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(cursor.slice(start, end), /inspectTarget|getBoundingClientRect|getComputedStyle/);
});

test("GPU capability probing is cached and releases the temporary WebGL context", () => {
  assert.match(device, /let weakGpu: boolean \| null = null/);
  assert.match(device, /if \(weakGpu !== null\) return weakGpu/);
  assert.match(device, /WEBGL_lose_context.*loseContext\(\)/);
});
