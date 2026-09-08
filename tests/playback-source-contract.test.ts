import assert from "node:assert/strict";
import test from "node:test";
import { contentShape, instagramEmbedUrl, platformForPlayback, tiktokIdFromUrl } from "../lib/watch/playable";

test("explicit photos retain their shape instead of entering the portrait-video lane", () => {
  assert.equal(contentShape({ platform: "tiktok", format: "photo" }), "square");
  assert.equal(contentShape({ platform: "instagram", format: "photo", orientation: "landscape" }), "landscape");
  assert.equal(contentShape({ platform: "instagram", format: "short" }), "portrait");
});

test("theater honors explicit providers without needing an external URL", () => {
  assert.equal(platformForPlayback("clip", "tiktok", ""), "tiktok");
  assert.equal(platformForPlayback("post", "instagram", ""), "instagram");
  assert.equal(platformForPlayback("clip", "", "https://evil.test/tiktok.com/video/1"), "house");
  assert.equal(platformForPlayback("clip", "", "https://tiktok.com.evil.test/video/1"), "house");
  assert.equal(platformForPlayback("clip", "", "https://www.tiktok.com/@core/video/123"), "tiktok");
});

test("provider embeds accept canonical links and reject lookalike hosts and unrelated paths", () => {
  assert.equal(tiktokIdFromUrl("https://www.tiktok.com/@core/video/123?lang=en"), "123");
  assert.equal(tiktokIdFromUrl("https://www.tiktok.com/player/v1/123"), "123");
  assert.equal(tiktokIdFromUrl("https://evil.test/video/123"), null);
  assert.equal(tiktokIdFromUrl("https://tiktok.com.evil.test/@core/video/123"), null);
  assert.equal(instagramEmbedUrl("https://www.instagram.com/p/ABC_123/?igsh=1"), "https://www.instagram.com/p/ABC_123/embed");
  assert.equal(instagramEmbedUrl("https://www.instagram.com/core/reel/ABC_123/"), "https://www.instagram.com/reel/ABC_123/embed");
  assert.equal(instagramEmbedUrl("https://evil.test/?url=instagram.com/reel/ABC"), null);
  assert.equal(instagramEmbedUrl("https://instagram.com.evil.test/p/ABC"), null);
});
