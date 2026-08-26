import assert from "node:assert/strict";
import test from "node:test";
import { getSeparateChatColumnCount } from "../components/live/ChatDock";

test("separate chat only uses columns when each can remain readable", () => {
  // 300px columns plus a 12px gap: a dock under 612px uses a tab strip.
  assert.equal(getSeparateChatColumnCount(611, 2), 1);
  assert.equal(getSeparateChatColumnCount(612, 2), 2);
  assert.equal(getSeparateChatColumnCount(923, 3), 2);
  assert.equal(getSeparateChatColumnCount(924, 3), 3);
});

test("separate chat caps the desktop grid at three columns", () => {
  assert.equal(getSeparateChatColumnCount(1800, 8), 3);
  assert.equal(getSeparateChatColumnCount(0, 1), 1);
});
