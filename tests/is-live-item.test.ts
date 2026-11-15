import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { isLiveWatchItem } from "../lib/watch/is-live-item.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { normalizeWatchItems } from "../lib/watch/normalize.ts";

test("only items with a live availability kind are considered live", () => {
  assert.equal(isLiveWatchItem({ kind: "live", format: "long" }), true);
  assert.equal(isLiveWatchItem({ kind: "youtube", format: "live" }), false);
  assert.equal(isLiveWatchItem({ kind: "vod", format: "live" }), false);
  assert.equal(isLiveWatchItem({ kind: "youtube", format: "long" }), false);
  assert.equal(isLiveWatchItem({ kind: "clip" }), false);
});

test("normalization turns a stale live format on a past broadcast into VOD format", () => {
  const normalized = normalizeWatchItems([{
    id: "past-broadcast",
    kind: "vod",
    platform: "youtube",
    title: "Past broadcast",
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#fff",
    href: "https://youtube.com/watch?v=past-broadcast",
    format: "live",
  }]);

  assert.equal(normalized[0]?.kind, "vod");
  assert.equal(normalized[0]?.format, "long");
});
