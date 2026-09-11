import assert from "node:assert/strict";
import test from "node:test";
import { formatPassportWatchTime } from "../components/passport/PassportWatchActivity";

test("Passport watch time preserves short sessions and hour boundaries", () => {
  assert.equal(formatPassportWatchTime(0), "0s");
  assert.equal(formatPassportWatchTime(29), "29s");
  assert.equal(formatPassportWatchTime(59.9), "59s");
  assert.equal(formatPassportWatchTime(60), "1m 0s");
  assert.equal(formatPassportWatchTime(3599), "59m 59s");
  assert.equal(formatPassportWatchTime(3600), "1h 0m 0s");
  assert.equal(formatPassportWatchTime(3701), "1h 1m 41s");
});

test("Passport does not display invalid or negative durations", () => {
  assert.equal(formatPassportWatchTime(-10), "0s");
  assert.equal(formatPassportWatchTime(Number.NaN), "0s");
  assert.equal(formatPassportWatchTime(Number.POSITIVE_INFINITY), "0s");
});
