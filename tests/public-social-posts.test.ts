import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { publicSocialPostFallback } from "../lib/watch/public-social-posts.ts";

test("uses canonical public post fallbacks for the verified Adapt profiles", () => {
  const tiktok = publicSocialPostFallback("tiktok", "@fazeadapt", "adapt", "Adapt · @fazeadapt", 3);
  const instagram = publicSocialPostFallback("instagram", "@thefazeadapt", "adapt", "Adapt · @thefazeadapt", 3);

  assert.equal(tiktok.length, 3);
  assert.equal(tiktok[0]?.sourceUrl, "https://www.tiktok.com/@fazeadapt/video/7677350723796913439");
  assert.equal(tiktok[0]?.embedUrl, "https://www.tiktok.com/player/v1/7677350723796913439");
  assert.ok(tiktok.every((item) => item.authorSlug === "adapt" && item.format === "short"));

  assert.equal(instagram.length, 3);
  assert.equal(instagram[0]?.sourceUrl, "https://www.instagram.com/reel/DR-YqDRkrZY/");
  assert.ok(instagram.every((item) => item.authorSlug === "adapt" && item.format === "short"));
});

test("does not fabricate a fallback for a profile that has not been verified", () => {
  assert.deepEqual(
    publicSocialPostFallback("instagram", "@unknown", "unknown", "Unknown", 12),
    [],
  );
});
