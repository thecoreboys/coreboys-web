import assert from "node:assert/strict";
import test from "node:test";
import { setTwitchHeroSound } from "../lib/watch/hero-audio";

test("sound gesture restores audible volume, unmutes, and requests Twitch playback", () => {
  const calls: unknown[] = [];
  setTwitchHeroSound({
    setVolume: (volume) => calls.push(["volume", volume]),
    setMuted: (muted) => calls.push(["muted", muted]),
    play: () => calls.push(["play"]),
  }, false);
  assert.deepEqual(calls, [["volume", 1], ["muted", false], ["play"]]);
});

test("muting never resumes a paused stream or changes its volume", () => {
  const calls: unknown[] = [];
  setTwitchHeroSound({
    setVolume: (volume) => calls.push(["volume", volume]),
    setMuted: (muted) => calls.push(["muted", muted]),
    play: () => calls.push(["play"]),
  }, true);
  assert.deepEqual(calls, [["muted", true]]);
});

test("sound controls tolerate a provider mounting or being torn down", () => {
  assert.doesNotThrow(() => setTwitchHeroSound(null, false));
  assert.doesNotThrow(() => setTwitchHeroSound({}, true));
});
