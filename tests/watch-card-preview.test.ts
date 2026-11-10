import assert from "node:assert/strict";
import test from "node:test";
import { nativeCardPreviewUrl, resolveHoverPreviewMedia } from "../lib/watch/card-preview";
import { embedFor } from "../lib/watch/playable";
import type { WatchItem } from "../lib/watch/types";

test("provider source markers use their player rather than a native video element", () => {
  for (const marker of ["youtube", "twitch", "tiktok", "instagram"]) assert.equal(nativeCardPreviewUrl({}, marker), null);
  assert.equal(nativeCardPreviewUrl({}, "https://www.youtube.com/watch?v=example"), null);
});

function item(overrides: Partial<WatchItem>): WatchItem {
  return { id: "preview", kind: "clip", platform: "house", title: "Preview", poster: "/poster.jpg", backdrop: "/poster.jpg", memberSlug: null, memberLabel: "CORE", accent: "#fff", href: "/watch?kind=clip", ...overrides };
}

test("expanded previews resolve videos, Shorts, Twitch streams, VODs, clips, and TikToks to autoplay sources", () => {
  for (const entry of [
    item({ kind: "youtube", platform: "youtube", sourceUrl: "https://www.youtube.com/watch?v=wideVideo01" }),
    item({ kind: "youtube", platform: "youtube", sourceUrl: "https://www.youtube.com/shorts/shortVideo1", format: "short" }),
    item({ kind: "live", platform: "twitch", live: { login: "example" } }),
    item({ kind: "vod", platform: "twitch", href: "/watch?kind=vod&id=123456" }),
    item({ platform: "twitch", href: "/watch?kind=clip&src=twitch&id=Clip123" }),
    item({ platform: "tiktok", sourceUrl: "https://www.tiktok.com/@example/video/1234567890123456789" }),
  ]) {
    const media = resolveHoverPreviewMedia(entry);
    assert.ok(media.playable, entry.sourceUrl ?? entry.href);
    const url = new URL(embedFor(media.playable, { parent: "core.test", origin: "https://core.test", muted: true, autoplay: true, controls: false })!);
    assert.ok(["1", "true"].includes(url.searchParams.get("autoplay")!));
    assert.ok(["1", "true"].includes((url.searchParams.get("muted") ?? url.searchParams.get("mute"))!));
  }
});

test("YouTube archive cards recover the video ID even without a provider URL", () => {
  const entry = item({ id: "yt-shortVideo1", kind: "youtube", platform: "youtube", href: "/watch", format: "short" });
  const preview = resolveHoverPreviewMedia(entry);
  assert.equal(preview.playable?.youtubeId, "shortVideo1");
  assert.equal(preview.platform, "youtube");
});

test("TikTok playback uses its official player when only its embed URL is present", () => {
  const entry = item({ platform: "tiktok", sourceUrl: "https://example.com/unavailable", embedUrl: "https://www.tiktok.com/player/v1/1234567890123456", format: "short" });
  const preview = resolveHoverPreviewMedia(entry);
  assert.ok(preview.playable);
  assert.match(embedFor(preview.playable, { parent: "core.test", origin: "https://core.test", muted: true })!, /^https:\/\/www\.tiktok\.com\/player\/v1\/1234567890123456\?/);
});

test("Reels and X videos use supplied native media or a matching playable cross-post", () => {
  assert.equal(resolveHoverPreviewMedia(item({ platform: "instagram", mediaUrl: "https://media.example/reel.mp4" })).nativeUrl, "https://media.example/reel.mp4");
  assert.equal(resolveHoverPreviewMedia(item({ platform: "x", kind: "post", mediaUrl: "https://video.twimg.com/post.mp4" })).nativeUrl, "https://video.twimg.com/post.mp4");
  const crosspost = resolveHoverPreviewMedia(item({ platform: "instagram", alternateSources: [{ platform: "tiktok", href: "https://www.tiktok.com/@example/video/1234567890123456789" }] }));
  assert.equal(crosspost.platform, "tiktok");
  assert.equal(crosspost.playable?.platform, "tiktok");
  for (const entry of [item({ format: "photo", mediaUrl: "https://media.example/photo.jpg" }), item({ platform: "x", kind: "post" }), item({ platform: "instagram" }), item({ platform: "youtube", embeddable: false })]) {
    assert.deepEqual(resolveHoverPreviewMedia(entry), { nativeUrl: null, playable: null, platform: null });
  }
  for (const restriction of [{ embeddable: false }, { previewStrategy: "external" as const }, { previewStrategy: "image" as const }]) {
    assert.equal(resolveHoverPreviewMedia(item({ kind: "live", platform: "twitch", live: { login: "example" }, ...restriction })).playable, null);
  }
});

test("native previews accept actual clips and approved opaque video media", () => {
  assert.equal(nativeCardPreviewUrl({}, "https://media.example/clip.mp4?token=one"), "https://media.example/clip.mp4?token=one");
  assert.equal(nativeCardPreviewUrl({ mediaUrl: "/media/clip.webm" }), "/media/clip.webm");
  assert.equal(nativeCardPreviewUrl({ previewStrategy: "video", mediaUrl: "https://media.example/signed-video" }), "https://media.example/signed-video");
  assert.equal(nativeCardPreviewUrl({ mediaUrl: "https://media.example/poster.jpg" }), null);
  assert.equal(nativeCardPreviewUrl({ previewStrategy: "video", mediaUrl: "javascript:alert(1)" }), null);
});
