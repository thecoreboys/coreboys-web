import test from "node:test";
import assert from "node:assert/strict";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { instagramPhotoShelfItems } from "../lib/watch/photos.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { instagramEmbedUrl } from "../lib/watch/playable.ts";
import type { WatchItem } from "../lib/watch/types";

function item(overrides: Partial<WatchItem> & Pick<WatchItem, "id">): WatchItem {
  const { id, ...rest } = overrides;
  return {
    id,
    kind: "tour",
    platform: "instagram",
    title: id,
    poster: `https://cdn.example/${id}.jpg`,
    backdrop: `https://cdn.example/${id}.jpg`,
    memberSlug: null,
    memberLabel: "CORE",
    accountLabel: "CORE · createownruneverything",
    accent: "#db0368",
    href: `https://www.instagram.com/p/${id}/`,
    sourceUrl: `https://www.instagram.com/p/${id}/`,
    format: "photo",
    orientation: "square",
    previewStrategy: "embed",
    embeddable: true,
    ...rest,
  };
}

test("Photos shelf keeps only Instagram image posts", () => {
  const result = instagramPhotoShelfItems([
    item({ id: "core-photo" }),
    item({ id: "house-still", platform: "house" }),
    item({ id: "instagram-reel", format: "short", kind: "clip" }),
  ]);

  assert.deepEqual(result.map((entry) => entry.id), ["core-photo"]);
  assert.ok(result.every((entry) => entry.platform === "instagram" && entry.format === "photo"));
});

test("Photos shelf gives each connected Instagram source a turn before repeating", () => {
  const result = instagramPhotoShelfItems([
    item({ id: "adapt-new", memberSlug: "adapt", memberLabel: "Adapt", accountLabel: "Adapt · thefazeadapt", publishedAt: "2026-08-20T12:00:00Z" }),
    item({ id: "adapt-older", memberSlug: "adapt", memberLabel: "Adapt", accountLabel: "Adapt · thefazeadapt", publishedAt: "2026-08-19T12:00:00Z" }),
    item({ id: "core", publishedAt: "2026-08-18T12:00:00Z" }),
    item({ id: "lacy", memberSlug: "lacy", memberLabel: "Lacy", accountLabel: "Lacy · lacy.himself", publishedAt: "2026-08-17T12:00:00Z" }),
  ]);

  assert.deepEqual(result.map((entry) => entry.id), ["adapt-new", "core", "lacy", "adapt-older"]);
});

test("Instagram permalinks resolve to official embed routes", () => {
  assert.equal(
    instagramEmbedUrl("https://www.instagram.com/p/Photo_123/?img_index=2"),
    "https://www.instagram.com/p/Photo_123/embed",
  );
  assert.equal(
    instagramEmbedUrl("https://instagram.com/reels/Reel_456/"),
    "https://www.instagram.com/reel/Reel_456/embed",
  );
  assert.equal(
    instagramEmbedUrl("https://www.instagram.com/tv/Video_789/"),
    "https://www.instagram.com/tv/Video_789/embed",
  );
  assert.equal(
    instagramEmbedUrl("https://www.instagram.com/createownruneverything/p/Photo_123/"),
    "https://www.instagram.com/p/Photo_123/embed",
  );
  assert.equal(instagramEmbedUrl("https://www.instagram.com/createownruneverything/"), null);
});
