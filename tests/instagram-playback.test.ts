import assert from "node:assert/strict";
import test from "node:test";
import { cachedInstagramPlayback, instagramPlaybackShortcode } from "../lib/watch/instagram-playback";

const now = Date.UTC(2026, 10, 13);
const expires = now + 2 * 60 * 60 * 1_000;
const signedUrl = `https://scontent-iad3-2.cdninstagram.com/video.mp4?oe=${Math.floor((now + 3_600_000) / 1_000).toString(16)}&signature=example`;
const reel = { shortcode: "CoreReel1", videoUrl: signedUrl };
const payload = (media: unknown[], name = "reels") => ({ status: "ok", body: { data: { [name]: media } } });

test("Reels without mediaType use only fresh video URLs from the existing response cache", () => {
  const result = cachedInstagramPlayback(payload([reel]), expires, now);
  assert.deepEqual(result.get("CoreReel1"), { url: signedUrl, expiresAt: now + 3_600_000 - 60_000 });
  assert.equal(cachedInstagramPlayback(payload([reel]), now + 30_000, now).size, 0);
  assert.equal(cachedInstagramPlayback(payload([reel]), expires, now + 3_600_000).size, 0);
});

test("cached playback excludes photos, carousels, unknown posts, other hosts and invalid responses", () => {
  for (const media of [
    { ...reel, mediaType: "image" }, { ...reel, mediaType: "sidecar" },
    { ...reel, videoUrl: "https://evil.example/video.mp4" },
    { ...reel, videoUrl: signedUrl.replace("https:", "http:") },
    { ...reel, videoUrl: signedUrl.replace("?oe=", "?oe=invalid") },
    { ...reel, shortcode: "../../private" },
  ]) assert.equal(cachedInstagramPlayback(payload([media]), expires, now).size, 0);
  assert.equal(cachedInstagramPlayback(payload([reel], "posts"), expires, now).size, 0);
  assert.equal(cachedInstagramPlayback(payload([{ ...reel, mediaType: "video" }], "posts"), expires, now).size, 1);
  for (const value of [null, {}, { status: "rate_limited", body: payload([reel]).body }]) {
    assert.equal(cachedInstagramPlayback(value, expires, now).size, 0);
  }
});

test("only canonical Instagram media URLs can request a cached playback source", () => {
  for (const route of ["reel", "reels", "p", "tv"]) assert.equal(instagramPlaybackShortcode(`https://www.instagram.com/${route}/CoreReel1/embed`), "CoreReel1");
  for (const url of ["https://instagram.com/profile", "https://instagram.com.evil.example/reel/CoreReel1/", "http://instagram.com/reel/CoreReel1/", "javascript:alert(1)"]) assert.equal(instagramPlaybackShortcode(url), null);
});
