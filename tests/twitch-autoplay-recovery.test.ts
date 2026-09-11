import assert from "node:assert/strict";
import test from "node:test";
import { advancingTwitchPlayback, createTwitchAutoplayBudget, createTwitchLivePlaybackClock, observedTwitchLivePlayback } from "../lib/watch/twitch-autoplay";

test("an unpaused Twitch flag at a frozen playhead never confirms autoplay", () => {
  assert.equal(advancingTwitchPlayback(-1, 0, false), false);
  assert.equal(advancingTwitchPlayback(0, 0, false), false);
  assert.equal(advancingTwitchPlayback(55, 55, false), false);
  assert.equal(advancingTwitchPlayback(0, 1, true), false);
  assert.equal(advancingTwitchPlayback(0, 1, false), true);
});

test("initial offscreen loading spends no attempts and visibility grants a bounded retry budget", () => {
  const budget = createTwitchAutoplayBudget();
  for (let n = 0; n < 30; n++) assert.equal(budget.takeAttempt(), false);
  budget.setVisible(true);
  for (let n = 0; n < 12; n++) assert.equal(budget.takeAttempt(), true);
  assert.equal(budget.exhausted, true);
  assert.equal(budget.takeAttempt(), false);
  budget.setVisible(true);
  assert.equal(budget.takeAttempt(), false, "repeated visible callbacks do not reset retries");
  budget.setVisible(false);
  budget.setVisible(true);
  assert.equal(budget.takeAttempt(), true, "returning to view can recover the initial start");
});

test("a native pause after confirmed playback stays paused across visibility changes", () => {
  const budget = createTwitchAutoplayBudget();
  budget.setVisible(true);
  budget.confirmPlayback();
  budget.pause();
  assert.equal(budget.takeAttempt(), false);
  budget.setVisible(false);
  budget.setVisible(true);
  assert.equal(budget.takeAttempt(), false);
  budget.restart();
  assert.equal(budget.takeAttempt(), true, "only an explicit Play request restarts recovery");
});

test("live playback requires a playing event plus active decoding, not a buffered unpaused flag", () => {
  const playing = { fps: 30, playbackRate: 3500, bufferSize: 4 };
  assert.equal(observedTwitchLivePlayback(false, false, playing), false);
  assert.equal(observedTwitchLivePlayback(true, true, playing), false);
  assert.equal(observedTwitchLivePlayback(true, false, { ...playing, bufferSize: 0 }), false);
  assert.equal(observedTwitchLivePlayback(true, false, { ...playing, fps: 0 }), false);
  assert.equal(observedTwitchLivePlayback(true, false, playing), true);
  assert.equal(observedTwitchLivePlayback(true, false, { playbackRate: 3500, bufferSize: 4 }), true);
  assert.equal(observedTwitchLivePlayback(true, false, undefined), false);
});

test("live watch time excludes pause, buffering, hidden tabs, and suspended polling gaps", () => {
  const clock = createTwitchLivePlaybackClock();
  assert.equal(clock.sample(1000, true), 0);
  assert.equal(clock.sample(2000, true), 1);
  assert.equal(clock.sample(3000, false), 1);
  assert.equal(clock.sample(4000, true), 1);
  assert.equal(clock.sample(5000, true), 2);
  assert.equal(clock.sample(9000, true), 2);
  assert.equal(clock.sample(10000, true), 3);
  assert.equal(clock.sample(11000, false), 3);
  assert.equal(clock.sample(110000, true), 3);
  assert.equal(clock.sample(111000, true), 4);
});
