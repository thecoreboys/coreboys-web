import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { normalizeWatchItems } from "../lib/watch/normalize.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { contentShape } from "../lib/watch/playable.ts";
import type { WatchItem } from "../lib/watch/types";

function media(
  id: string,
  platform: WatchItem["platform"],
  sourceUrl: string,
  format: WatchItem["format"] = "long",
): WatchItem {
  return {
    id,
    platform,
    kind: "clip",
    format,
    orientation: "landscape",
    width: 1920,
    height: 1080,
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#ef4444",
    href: sourceUrl,
    sourceUrl,
  };
}

test("groups TikToks, Instagram Reels, and YouTube Shorts as portrait short form", () => {
  const items = normalizeWatchItems([
    media("tiktok", "tiktok", "https://www.tiktok.com/@adapt/video/123"),
    media("reel", "instagram", "https://www.instagram.com/reel/ABC123/"),
    media("short", "youtube", "https://www.youtube.com/shorts/abcdefghijk"),
  ]);

  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(item.format, "short");
    assert.equal(item.orientation, "portrait");
    assert.equal(contentShape(item), "portrait");
  }
});

test("a short-form classification wins over stale landscape metadata", () => {
  const item = media("stale-short", "youtube", "https://youtube.com/watch?v=abcdefghijk", "short");
  assert.equal(contentShape(item), "portrait");
  assert.equal(normalizeWatchItems([item])[0]?.orientation, "portrait");
});
