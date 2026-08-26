import assert from "node:assert/strict";
import test from "node:test";
import {
  X_FEED_LOCAL_QA_MAX_AGE_HOURS,
  X_FEED_PUBLIC_MAX_AGE_HOURS,
  xFeedSnapshotAgeHours,
  xFeedSnapshotWithinAge,
} from "../lib/x-feed-freshness";

const NOW = Date.parse("2026-08-23T18:00:00.000Z");

test("production and local QA use distinct bounded snapshot ages", () => {
  assert.equal(X_FEED_PUBLIC_MAX_AGE_HOURS, 24);
  assert.equal(X_FEED_LOCAL_QA_MAX_AGE_HOURS, 168);

  const thirtySixHoursOld = "2026-08-22T06:00:00.000Z";
  assert.equal(xFeedSnapshotAgeHours(thirtySixHoursOld, NOW), 36);
  assert.equal(xFeedSnapshotWithinAge(thirtySixHoursOld, X_FEED_PUBLIC_MAX_AGE_HOURS, NOW), false);
  assert.equal(xFeedSnapshotWithinAge(thirtySixHoursOld, X_FEED_LOCAL_QA_MAX_AGE_HOURS, NOW), true);
});

test("future, invalid, and older-than-one-week snapshots fail closed", () => {
  assert.equal(xFeedSnapshotWithinAge("not-a-date", 168, NOW), false);
  assert.equal(xFeedSnapshotWithinAge("2026-08-24T18:00:00.000Z", 168, NOW), false);
  assert.equal(xFeedSnapshotWithinAge("2026-08-16T17:59:59.000Z", 168, NOW), false);
});
