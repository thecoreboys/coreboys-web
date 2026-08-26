import assert from "node:assert/strict";
import test from "node:test";
import { floatingChatViewportStyle } from "../lib/watch/floating-chat";

test("normalized floating chat geometry keeps the legacy trailing-edge placement", () => {
  const style = floatingChatViewportStyle({
    x: 0.727778,
    y: 0.328395,
    width: 0.255556,
    height: 0.641975,
  });

  // 1440 × 810 is the old workspace conversion board: this is the same
  // 24px right/bottom placement, now expressed responsively.
  assert.deepEqual(style, {
    right: "1.6666vw",
    bottom: "2.963dvh",
    width: "clamp(18rem, 25.5556vw, calc(100vw - 2rem))",
    height: "clamp(20rem, 64.1975dvh, calc(100dvh - 5rem))",
  });
});

test("floating chat bridge clamps invalid normalized geometry before rendering", () => {
  const style = floatingChatViewportStyle({ x: 0.96, y: 0.95, width: 0.4, height: 0.4 });

  assert.equal(style.right, "0vw");
  assert.equal(style.bottom, "0dvh");
  assert.equal(style.width, "clamp(18rem, 40vw, calc(100vw - 2rem))");
  assert.equal(style.height, "clamp(20rem, 40dvh, calc(100dvh - 5rem))");
});
