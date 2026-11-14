import assert from "node:assert/strict";
import test from "node:test";
import { radioPreloadNetwork, canPreloadRadioAudio } from "../lib/radio/preload";

test("radio warmup targets the visible station and excludes utility pages", () => {
  assert.equal(radioPreloadNetwork("/"), "core");
  assert.equal(radioPreloadNetwork("/guide"), "core");
  assert.equal(radioPreloadNetwork("/channels/ron"), "ron");
  assert.equal(radioPreloadNetwork("/watch/network/adapt/"), "adapt");
  for (const path of ["/account", "/legal/privacy", "/channels/invalid", "/channels/ron/x", "/watch/live/lacy"]) {
    assert.equal(radioPreloadNetwork(path), null, path);
  }
});

test("optional audio downloads respect browser connection and data-saving preferences", () => {
  assert.equal(canPreloadRadioAudio(), true);
  assert.equal(canPreloadRadioAudio({ effectiveType: "4g" }), true);
  for (const connection of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
    assert.equal(canPreloadRadioAudio(connection), false);
  }
});
