import assert from "node:assert/strict";
import test from "node:test";
import { formatLiveAirtime, liveForLabel } from "../lib/watch/airtime";

test("formats live airtime with a second-accurate clock", () => {
  assert.equal(formatLiveAirtime(0), "0s");
  assert.equal(formatLiveAirtime(65), "1m 5s");
  assert.equal(formatLiveAirtime(3_665), "1h 1m 5s");
  assert.equal(formatLiveAirtime(90_061), "1d 1h 1m 1s");
});

test("builds a precise Live for label and clamps future starts", () => {
  const start = "2026-08-20T21:12:29.000Z";
  assert.equal(
    liveForLabel(start, Date.parse("2026-08-20T21:20:52.000Z")),
    "Live for 8m 23s",
  );
  assert.equal(liveForLabel(start, Date.parse("2026-08-20T21:12:20.000Z")), "Live for 0s");
});

test("omits live airtime when the start is unavailable or invalid", () => {
  assert.equal(liveForLabel(null), null);
  assert.equal(liveForLabel("not-a-date"), null);
});
