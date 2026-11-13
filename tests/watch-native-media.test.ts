import assert from "node:assert/strict";
import test from "node:test";
import { nativeVideoSource, playWithMutedFallback, safeMediaUrl } from "../lib/watch/native-media";
import { itemToPlayable } from "../lib/watch/playable";
import type { WatchItem } from "../lib/watch/types";

test("legacy Theater links and direct source URLs work in previews and full playback", () => {
  const url = "https://media.example/clip.mp4?signature=one#t=2";
  for (const source of [{ sourceUrl: url }, { url }, { embedUrl: url }, { href: `/theater?kind=clip&url=${encodeURIComponent(url)}` }, { href: `/theater?kind=clip&media=${encodeURIComponent(url)}` }]) {
    assert.equal(nativeVideoSource(source), url);
    const item = { id: "clip", kind: "clip", platform: "house", title: "Clip", memberSlug: null, memberLabel: "CORE", poster: "/poster.jpg", backdrop: "/poster.jpg", accent: "#fff", href: "/theater?kind=clip", ...source } as WatchItem;
    assert.equal(itemToPlayable(item)?.mediaUrl, url);
  }
});

test("opaque Reel video URLs require explicit video metadata and exclude photos", () => {
  const mediaUrl = "https://scontent.cdninstagram.com/signed-media?token=one";
  assert.equal(nativeVideoSource({ mediaUrl }), null);
  assert.equal(nativeVideoSource({ mediaUrl, previewStrategy: "video" }), mediaUrl);
  assert.equal(nativeVideoSource({ mediaUrl, previewStrategy: "video", format: "photo" }), null);
  for (const url of ["https://youtube.com/watch?v=clip.mp4", "https://example.com/preview?file=clip.mp4", "https://example.com/photo.jpg#video.mp4", "javascript:video.mp4", "//example.com/video.mp4", "/\\example.com/video.mp4"]) {
    assert.equal(nativeVideoSource({ sourceUrl: url }), null, url);
  }
  assert.equal(safeMediaUrl("https://username:password@example.com/video.mp4"), false);
});

test("audible autoplay recovers muted once when the browser requires it", async () => {
  let calls = 0;
  const media = { muted: false, play: async () => { if (++calls === 1) throw new DOMException("Blocked", "NotAllowedError"); } };
  await playWithMutedFallback(media);
  assert.equal(calls, 2);
  assert.equal(media.muted, true);
});

test("autoplay does not retry codec failures, muted blocks, or a cancelled user intent", async () => {
  for (const [muted, name, active] of [[false, "NotSupportedError", true], [true, "NotAllowedError", true], [false, "NotAllowedError", false]] as const) {
    let calls = 0;
    const media = { muted, play: async () => { calls++; throw new DOMException("Rejected", name); } };
    await assert.rejects(playWithMutedFallback(media, () => active), { name });
    assert.equal(calls, 1);
    assert.equal(media.muted, muted);
  }
});
