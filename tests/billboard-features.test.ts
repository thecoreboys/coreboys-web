import assert from "node:assert/strict";
import test from "node:test";
import { buildBillboardSlides, isBillboardFeatureActive } from "../lib/watch/billboard-features";
import { STREAMER_AWARDS_WINNER_ENDS_AT_MS } from "../lib/streamer-awards";
import type { WatchItem } from "../lib/watch/types";

const item = (id: string): WatchItem => ({
  id, title: id, kind: "youtube", platform: "youtube", poster: "/poster.webp", backdrop: "/poster.webp",
  memberSlug: null, memberLabel: "CORE", accent: "#db0368", href: `/watch/${id}`,
});
const feature = { id: "awards", title: "CORE awards", content: { artwork: "/awards.webp" }, expiresAt: STREAMER_AWARDS_WINNER_ENDS_AT_MS };

test("artwork is the second hero item and preserves the media order", () => {
  const items = [item("lead"), item("second"), item("third")];
  const slides = buildBillboardSlides(items, feature);
  assert.deepEqual(slides.map((slide) => slide.id), ["lead", "awards", "second", "third"]);
  assert.equal(slides[0]?.kind, "media");
  assert.deepEqual(slides[1], { kind: "feature", id: feature.id, title: feature.title, content: feature.content });
  assert.equal("item" in slides[1]!, false, "artwork must not become playable media");
  assert.deepEqual(items.map((entry) => entry.id), ["lead", "second", "third"]);
});

test("the hero still works without artwork or media", () => {
  assert.deepEqual(buildBillboardSlides([item("lead")]).map((slide) => slide.kind), ["media"]);
  assert.deepEqual(buildBillboardSlides([], feature).map((slide) => slide.id), ["awards"]);
  assert.deepEqual(buildBillboardSlides([]), []);
});

test("the one-week promotion ends November 20 at 3 PM Eastern", () => {
  const start = Date.parse("2026-11-13T20:00:00Z");
  assert.equal(STREAMER_AWARDS_WINNER_ENDS_AT_MS - start, 7 * 24 * 60 * 60 * 1000);
  assert.equal(isBillboardFeatureActive(STREAMER_AWARDS_WINNER_ENDS_AT_MS, STREAMER_AWARDS_WINNER_ENDS_AT_MS - 1), true);
  assert.equal(isBillboardFeatureActive(STREAMER_AWARDS_WINNER_ENDS_AT_MS, STREAMER_AWARDS_WINNER_ENDS_AT_MS), false);
  assert.equal(isBillboardFeatureActive(STREAMER_AWARDS_WINNER_ENDS_AT_MS, STREAMER_AWARDS_WINNER_ENDS_AT_MS + 1), false);
  assert.equal(isBillboardFeatureActive(STREAMER_AWARDS_WINNER_ENDS_AT_MS, Number.NaN), false);
  assert.equal(isBillboardFeatureActive(Number.NaN, start), false);
});
