import assert from "node:assert/strict";
import test from "node:test";
import { STREAMER_AWARDS_ENDS_AT_MS, streamerAwardsCountdown } from "../lib/streamer-awards";

test("awards expire November 12 at 5 PM Pacific and 8 PM Eastern", () => {
  const parts = (timeZone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
  }).formatToParts(STREAMER_AWARDS_ENDS_AT_MS).map((part) => [part.type, part.value]));
  assert.deepEqual([parts("America/Los_Angeles").year, parts("America/Los_Angeles").month,
    parts("America/Los_Angeles").day, parts("America/Los_Angeles").hour], ["2026", "11", "12", "17"]);
  assert.equal(parts("America/New_York").hour, "20");
  assert.equal(parts("America/New_York").day, "12");
});

test("the last fraction of a second remains visible and the exact cutoff removes the section", () => {
  assert.deepEqual(streamerAwardsCountdown(STREAMER_AWARDS_ENDS_AT_MS - 1), { days: 0, hours: 0, minutes: 0, seconds: 1 });
  assert.equal(streamerAwardsCountdown(STREAMER_AWARDS_ENDS_AT_MS), null);
  assert.equal(streamerAwardsCountdown(STREAMER_AWARDS_ENDS_AT_MS + 60_000), null);
});

test("countdown uses elapsed wall time, including day rollovers and suspended tabs", () => {
  const before = STREAMER_AWARDS_ENDS_AT_MS - ((86_400 + 3_600 + 120 + 5) * 1000);
  assert.deepEqual(streamerAwardsCountdown(before), { days: 1, hours: 1, minutes: 2, seconds: 5 });
  assert.deepEqual(streamerAwardsCountdown(before + 3_605_000), { days: 1, hours: 0, minutes: 2, seconds: 0 });
  assert.equal(streamerAwardsCountdown(Number.NaN), null);
});
