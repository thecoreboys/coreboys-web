import { strict as assert } from "node:assert";
import { test } from "node:test";
import { shortSwipeDirection } from "../lib/watch/short-swipe";

test("shorts navigate only for deliberate vertical swipes", () => {
  assert.equal(shortSwipeDirection(4, -100), "next");
  assert.equal(shortSwipeDirection(-8, 100), "previous");
  assert.equal(shortSwipeDirection(3, -20), null);
  assert.equal(shortSwipeDirection(120, -65), null);
});
