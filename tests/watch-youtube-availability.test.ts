import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isYouTubeVideoAvailable, missingYouTubeVideoIds } from "../lib/watch/youtube-availability";

test("YouTube availability rejects private and non-embeddable videos", () => {
  assert.equal(isYouTubeVideoAvailable({ privacyStatus: "public", embeddable: true }), true);
  assert.equal(isYouTubeVideoAvailable({ privacyStatus: "unlisted", embeddable: true }), true);
  assert.equal(isYouTubeVideoAvailable({ privacyStatus: "private", embeddable: true }), false);
  assert.equal(isYouTubeVideoAvailable({ privacyStatus: "public", embeddable: false }), false);
});

test("successful metadata lookups identify IDs omitted after becoming private or deleted", () => {
  assert.deepEqual(
    missingYouTubeVideoIds(["still-public", "now-private", "deleted"], new Set(["still-public"])),
    ["now-private", "deleted"],
  );
});

test("unavailable YouTube items are dropped before entering the shared catalog and archive", () => {
  const catalog = readFileSync("lib/watch/catalog.ts", "utf8");
  const archive = readFileSync("lib/media-intelligence/archive.ts", "utf8");

  assert.match(catalog, /if \(item\.embeddable === false\) return null/);
  assert.match(catalog, /if \(!meta\.available\) return \{ \.\.\.item, embeddable: false \}/);
  assert.match(archive, /video\.status\?\.privacyStatus === "private" \|\| video\.status\?\.embeddable === false/);
});
