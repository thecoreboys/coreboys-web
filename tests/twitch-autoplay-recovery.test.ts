import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { advancingTwitchPlayback, createTwitchAutoplayBudget, createTwitchLivePlaybackClock, exposedTwitchPlayer, exposedTwitchPreview, observedTwitchLivePlayback } from "../lib/watch/twitch-autoplay";

test("channel autoplay waits for a full-size unobscured Twitch frame", () => {
  const entry = { isIntersecting: true, intersectionRatio: 1,
    boundingClientRect: { width: 640, height: 360 }, isVisible: true };
  assert.equal(exposedTwitchPlayer(entry, true), true);
  assert.equal(exposedTwitchPlayer({ ...entry, intersectionRatio: 0.8 }, true), false);
  assert.equal(exposedTwitchPlayer({ ...entry, boundingClientRect: { width: 399, height: 360 } }), false);
  assert.equal(exposedTwitchPlayer({ ...entry, boundingClientRect: { width: 640, height: 299 } }), false);
  assert.equal(exposedTwitchPlayer({ ...entry, isVisible: false }, true), false);
  assert.equal(exposedTwitchPlayer({ ...entry, isVisible: undefined }, true), false);
  assert.equal(exposedTwitchPlayer({ ...entry, isVisible: undefined }), true,
    "browsers without occlusion tracking still use size and intersection");
});

test("a clipped hover popup preserves its autoplay budget until fully exposed", () => {
  const budget = createTwitchAutoplayBudget();
  for (const entry of [
    { isIntersecting: true, intersectionRatio: 0.98 },
    { isIntersecting: true, intersectionRatio: 0.6 },
    { isIntersecting: false, intersectionRatio: 0 },
  ]) {
    budget.setVisible(exposedTwitchPreview(entry));
    for (let n = 0; n < 20; n++) assert.equal(budget.takeAttempt(), false);
  }
  budget.setVisible(exposedTwitchPreview({ isIntersecting: true, intersectionRatio: 1 }));
  assert.equal(budget.takeAttempt(), true);
});

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
  assert.equal(budget.manuallyPaused, true);
  assert.equal(budget.takeAttempt(), false);
  budget.setVisible(false);
  budget.setVisible(true);
  assert.equal(budget.takeAttempt(), false);
  budget.restart();
  assert.equal(budget.manuallyPaused, false);
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

test("Twitch starts muted and restores the room audio choice only after playback advances", () => {
  const source = readFileSync("components/watch/TwitchTileMedia.tsx", "utf8");
  assert.match(source, /autoplay:\s*true,\s*muted:\s*true/);
  assert.match(source, /instance\.setMuted\?\.\(true\);[\s\S]{0,140}instance\.play\?\.\(\)/);
  assert.match(source, /const firstConfirmedFrame = !budget\.started;[\s\S]{0,260}if \(firstConfirmedFrame\)[\s\S]{0,180}instance\.setMuted\?\.\(current\.current\.muted\)/);
  assert.doesNotMatch(source, /Player\.PLAYING[\s\S]{0,160}setStartRequired\(false\)/);
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

test("Twitch VODs start at their offset through the embed time option, never a READY seek", async () => {
  const { twitchStartTime } = await import("../lib/watch/playable");
  assert.equal(twitchStartTime(0), null);
  assert.equal(twitchStartTime(0.4), null);
  assert.equal(twitchStartTime(Number.NaN), null);
  assert.equal(twitchStartTime(85), "0h1m25s");
  assert.equal(twitchStartTime(3_723.9), "1h2m3s");
  // seek() right after READY cancels Twitch's own autoplay: the VOD freezes
  // at the offset behind the click-to-play overlay.
  for (const file of ["components/watch/TwitchHoverMedia.tsx", "components/watch/TwitchTileMedia.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /twitchStartTime\(/, `${file} passes the start offset at creation`);
    const ready = source.slice(source.indexOf("Player.READY"), source.indexOf("Player.READY") + 1_400);
    assert.doesNotMatch(ready.split(/Player\.PLAYING/)[0], /\.seek\??\.?\(/, `${file} must not seek on READY`);
  }
  // The full player resumes through `time` and marks that resume done, so its
  // READY handler skips the seek it keeps for resume points set later.
  const player = readFileSync("components/watch/PersistentPlayer.tsx", "utf8");
  const creation = player.indexOf("instance = new api.Player(id, options)");
  const resumed = player.indexOf("resumedOwnerRef.current = resume.resumeOwner;");
  assert.ok(player.includes("twitchStartTime(resume.resumeAt)") && resumed > 0 && resumed < creation);
});
