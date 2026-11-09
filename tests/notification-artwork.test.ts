import assert from "node:assert/strict";
import test from "node:test";
import { notificationArtworkSource } from "../lib/notification-artwork";

test("YouTube videos and Shorts recover thumbnails even without stored artwork", () => {
  for (const href of ["https://www.youtube.com/watch?v=Abcdef12345", "https://www.youtube.com/shorts/Abcdef12345"]) {
    const source = notificationArtworkSource({ href });
    assert.equal(source.provider, "youtube");
    assert.equal(source.youtubeId, "Abcdef12345");
    assert.equal(source.src, "");
  }
  assert.equal(notificationArtworkSource({ href: "https://youtube.com/shorts/Abcdef12345" }).orientation, "portrait");
});

test("TikTok and Instagram use their own post URL for missing or expired covers", () => {
  const tiktok = "https://www.tiktok.com/@creator/video/7705995582493461774";
  const short = notificationArtworkSource({ href: tiktok, imageUrl: "https://cdn.example/expired.jpg" });
  assert.equal(short.tiktokSourceUrl, tiktok);
  assert.equal(short.orientation, "portrait");
  assert.equal(notificationArtworkSource({ href: tiktok }).tiktokSourceUrl, tiktok);
  const reel = "https://www.instagram.com/reel/ABCdef12345/";
  assert.equal(notificationArtworkSource({ href: reel }).instagramSourceUrl, reel);
  assert.equal(notificationArtworkSource({ href: reel }).orientation, "portrait");
  assert.equal(notificationArtworkSource({ href: "https://www.instagram.com/p/ABCdef12345/", orientation: "square" }).orientation, "square");
});

test("live streams, photos, and X media retain actual artwork and explicit proportions", () => {
  for (const href of ["https://www.twitch.tv/lacy", "https://x.com/creator/status/123/photo/1", "https://instagram.com/p/ABCdef12345/"]) {
    const source = notificationArtworkSource({ href, imageUrl: "/campaigns/photo.webp", orientation: "square" });
    assert.equal(source.src, "/campaigns/photo.webp");
    assert.equal(source.orientation, "square");
  }
});

test("text-only posts never present their author's avatar as content artwork", () => {
  const source = notificationArtworkSource({ href: "https://x.com/creator/status/123", imageUrl: "https://pbs.twimg.com/avatar.jpg", avatarUrl: "https://pbs.twimg.com/avatar.jpg" });
  assert.equal(source.provider, "x");
  assert.equal(source.src, "");
});

test("internal notifications infer their provider without sending local routes to thumbnail APIs", () => {
  const source = notificationArtworkSource({ href: "/theater?kind=clip&src=tiktok&id=7705995582493461774", provider: "tiktok" });
  assert.equal(source.tiktokSourceUrl, undefined);
});
