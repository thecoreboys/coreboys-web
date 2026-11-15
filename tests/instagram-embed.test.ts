import assert from "node:assert/strict";
import test from "node:test";
import { embedFor, instagramEmbedUrl } from "../lib/watch/playable";

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

test("uses the official Instagram player for Reel watch items without a direct video file", () => {
  const src = embedFor({
    key: "instagram-reel",
    kind: "clip",
    platform: "instagram",
    title: "How did she do?",
    poster: "https://cdn.example.test/reel.jpg",
    memberSlug: "lacy",
    memberLabel: "Lacy",
    youtubeId: null,
    twitchLogin: null,
    vodId: null,
    clipSrc: null,
    clipId: null,
    url: "https://www.instagram.com/reel/ABC_123/",
    sourceUrl: "https://www.instagram.com/reel/ABC_123/",
  }, { parent: "thecoreboys.com", origin: "https://thecoreboys.com", autoplay: true });

  assert.equal(src, "https://www.instagram.com/reel/ABC_123/embed");
});
