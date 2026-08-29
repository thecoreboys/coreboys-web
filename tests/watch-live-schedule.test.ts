import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner accepts explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { liveTimelineEndMs } from "../lib/watch/live-schedule.ts";

test("a current live timeline block never ends behind Now when its provider end is stale", () => {
  const start = Date.parse("2026-08-27T12:00:00.000Z");
  const staleEnd = Date.parse("2026-08-27T13:00:00.000Z");
  const now = Date.parse("2026-08-27T15:14:59.000Z");

  const projected = liveTimelineEndMs(start, staleEnd, now);

  assert.equal(projected, Date.parse("2026-08-27T15:30:00.000Z"));
  assert.ok(projected > now);
});

test("a live timeline forecast advances only at its next shared boundary", () => {
  const start = Date.parse("2026-08-27T12:00:00.000Z");
  const staleEnd = Date.parse("2026-08-27T13:00:00.000Z");
  const beforeBoundary = Date.parse("2026-08-27T15:29:59.000Z");
  const atBoundary = Date.parse("2026-08-27T15:30:00.000Z");

  assert.equal(liveTimelineEndMs(start, staleEnd, beforeBoundary), atBoundary);
  assert.equal(liveTimelineEndMs(start, staleEnd, atBoundary), Date.parse("2026-08-27T16:00:00.000Z"));
});
