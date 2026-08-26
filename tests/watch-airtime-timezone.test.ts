import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping runner accepts explicit TypeScript suffixes.
import { formatWentLive } from "../lib/watch/airtime.ts";

test("formats the same instant in the viewer timezone", () => {
  const instant = "2026-08-20T17:00:00.000Z";
  const now = Date.parse("2026-08-20T18:00:00.000Z");

  assert.equal(
    formatWentLive(instant, now, { locale: "en-US", timeZone: "America/New_York" }),
    "1:00 PM EDT",
  );
  assert.equal(
    formatWentLive(instant, now, { locale: "en-US", timeZone: "America/Los_Angeles" }),
    "10:00 AM PDT",
  );
  assert.equal(
    formatWentLive(instant, now, { locale: "en-GB", timeZone: "Europe/London" }),
    "18:00 BST",
  );
});

test("Yesterday follows the viewer calendar rather than a fixed house timezone", () => {
  const instant = "2026-08-19T23:00:00.000Z";
  const now = Date.parse("2026-08-20T13:00:00.000Z");

  assert.match(
    formatWentLive(instant, now, { locale: "en-US", timeZone: "America/New_York" }),
    /^Yesterday /,
  );
  assert.doesNotMatch(
    formatWentLive(instant, now, { locale: "en-US", timeZone: "Asia/Tokyo" }),
    /^Yesterday /,
  );
});
