import assert from "node:assert/strict";
import test from "node:test";
import { instagramEmbedUrl } from "../lib/watch/playable";

test("uses official Instagram embed routes for Reels and posts", () => {
  assert.equal(
    instagramEmbedUrl("https://www.instagram.com/reel/DN4R33L/?igsh=abc"),
    "https://www.instagram.com/reel/DN4R33L/embed",
  );
  assert.equal(
    instagramEmbedUrl("https://instagram.com/p/DN4P0ST/"),
    "https://www.instagram.com/p/DN4P0ST/embed",
  );
});

test("does not treat an Instagram profile as an embeddable post", () => {
  assert.equal(instagramEmbedUrl("https://www.instagram.com/lacy.himself/"), null);
});
