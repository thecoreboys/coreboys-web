import assert from "node:assert/strict";
import test from "node:test";
import { hasMeasuredPlaybackCompletion, isNewWatchObservation, measureWatchSeconds, measureWatchWindow, type WatchMeasurementCursor, type WatchMeasurementInput } from "../lib/watch/measurement";

const start = Date.parse("2026-09-10T12:00:00Z");
const at = (seconds: number) => new Date(start + seconds * 1_000).toISOString();
const cursor: WatchMeasurementCursor = { item_ref: "youtube:abc", session_id: "tab-session-a", position_seconds: 100, observed_at: at(0), received_at: at(0) };
const tick: WatchMeasurementInput = { ref: cursor.item_ref, sessionId: cursor.session_id, positionSeconds: 115, seconds: 15, observedAt: at(15), receivedAt: at(15) };

test("playback completion needs a near-end observation and measured viewing, never a manual high-water mark", () => {
  assert.equal(hasMeasuredPlaybackCompletion(0, 900, 0), false);
  assert.equal(hasMeasuredPlaybackCompletion(900, 900, 15), false);
  assert.equal(hasMeasuredPlaybackCompletion(null, 900, 900), false);
  assert.equal(hasMeasuredPlaybackCompletion(850, 900, 750), true);
  assert.equal(hasMeasuredPlaybackCompletion(850, 900, 375, 2), true);
});

test("measured watch time counts elapsed playback, including playback speed", () => {
  assert.equal(measureWatchSeconds(cursor, tick), 15);
  assert.equal(measureWatchSeconds(cursor, { ...tick, positionSeconds: 130, playbackRate: 2 }), 15);
  assert.equal(measureWatchSeconds(cursor, { ...tick, positionSeconds: 107.5, playbackRate: 0.5 }), 15);
  assert.equal(measureWatchSeconds(cursor, { ...tick, positionSeconds: 101, playbackRate: 0.5 }), 2);
  assert.equal(measureWatchSeconds(cursor, { ...tick, seconds: 180 }), 15);
  assert.equal(measureWatchSeconds(cursor, { ...tick, seconds: 6 }), 6);
});

test("seeks, pauses, checkpoints, missing time and background gaps add no watch time", () => {
  for (const patch of [
    { positionSeconds: 800 }, { positionSeconds: 50 }, { positionSeconds: 100 },
    { positionSeconds: null }, { seconds: 0 }, { seconds: NaN },
    { receivedAt: at(90), observedAt: at(90), positionSeconds: 190 },
    { playbackRate: 0 }, { playbackRate: NaN }, { playbackRate: 3 },
  ]) assert.equal(measureWatchSeconds(cursor, { ...tick, ...patch }), 0);
  assert.equal(measureWatchSeconds(null, tick), 0);
});

test("retries and out-of-order observations cannot repeat credit", () => {
  const applied = { ...cursor, position_seconds: 115, observed_at: at(15), received_at: at(15) };
  assert.equal(isNewWatchObservation(applied, tick.observedAt), false);
  assert.equal(isNewWatchObservation(applied, at(10)), false);
  assert.equal(isNewWatchObservation(applied, at(30)), true);
  assert.equal(measureWatchSeconds(applied, { ...tick, receivedAt: at(20) }), 0);
});

test("one account cannot add concurrent player time across tabs or content", () => {
  assert.equal(measureWatchSeconds(cursor, { ...tick, sessionId: "tab-session-b" }), 0);
  assert.equal(measureWatchSeconds(cursor, { ...tick, ref: "twitch:second-stream" }), 0);
  assert.equal(measureWatchSeconds(cursor, { ...tick, receivedAt: at(4) }), 4);
});

test("subsecond timing survives repeated ticks instead of rounding down every sample", () => {
  let previous = { ...cursor };
  let total = 0;
  for (let sample = 1; sample <= 10; sample++) {
    const input = { ...tick, seconds: 1.5, positionSeconds: 100 + sample * 1.5, observedAt: at(sample * 1.5), receivedAt: at(sample * 1.5) };
    const result = measureWatchWindow(previous, input);
    total += result.seconds;
    previous = { ...previous, position_seconds: input.positionSeconds, observed_at: input.observedAt, received_at: input.receivedAt, remainder_seconds: result.remainderSeconds };
  }
  assert.equal(total, 15);
  assert.equal(previous.remainder_seconds, 0);
});
