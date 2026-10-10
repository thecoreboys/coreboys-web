import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { isLiveWatchItem } from "../lib/watch/is-live-item.ts";

test("live detection excludes inconsistent archived records from VOD shelves", () => {
  assert.equal(isLiveWatchItem({ kind: "live", format: "long" }), true);
  assert.equal(isLiveWatchItem({ kind: "youtube", format: "live" }), true);
  assert.equal(isLiveWatchItem({ kind: "vod", format: "live" }), true);
  assert.equal(isLiveWatchItem({ kind: "youtube", format: "long" }), false);
  assert.equal(isLiveWatchItem({ kind: "clip" }), false);
});
