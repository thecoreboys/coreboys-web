import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicFacePresenceResponse } from "../lib/face-presence-public";

test("public face presence strips private fields and accepts a reviewed tag", () => {
  const parsed = parsePublicFacePresenceResponse({
    contentId: "yt-demo",
    atMs: 12_000,
    tags: [{
      trackId: "track-1",
      identityId: "identity-1",
      displayName: "Demo Person",
      profileHref: "/m/demo",
      avatarUrl: "/members/demo.jpg",
      socialLinks: [{ platform: "twitch", label: "@demo", url: "https://twitch.tv/demo" }],
      bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      startMs: 10_000,
      endMs: 15_000,
      confidenceBand: "reviewed",
      embedding: [0.1, 0.2],
      similarity: 0.99,
      evidenceCropUrl: "https://private.invalid/crop.jpg",
    }],
  });

  assert.ok(parsed);
  assert.equal(parsed.tags.length, 1);
  assert.deepEqual(Object.keys(parsed.tags[0]!).sort(), [
    "avatarUrl",
    "bbox",
    "confidenceBand",
    "displayName",
    "endMs",
    "identityId",
    "profileHref",
    "socialLinks",
    "startMs",
    "trackId",
  ]);
  assert.equal("embedding" in parsed.tags[0]!, false);
  assert.equal("similarity" in parsed.tags[0]!, false);
});

test("public face presence rejects unsafe profiles and malformed boxes", () => {
  const parsed = parsePublicFacePresenceResponse({
    contentId: "video-1",
    atMs: 1,
    tags: [
      {
        trackId: "bad-profile",
        identityId: "identity-1",
        displayName: "Bad",
        profileHref: "https://evil.invalid/person",
        bbox: null,
        startMs: 0,
        endMs: 10,
        confidenceBand: "reviewed",
      },
      {
        trackId: "safe-profile",
        identityId: "identity-2",
        displayName: "Safe",
        profileHref: "/crew/safe",
        avatarUrl: "/api/admin/faces",
        bbox: { x: 0.9, y: 0.2, width: 0.3, height: 0.3 },
        startMs: 0,
        endMs: 10,
        confidenceBand: "high",
      },
      {
        trackId: "traversal-profile",
        identityId: "identity-3",
        displayName: "Traversal",
        profileHref: "/m/../../admin",
        bbox: null,
        startMs: 0,
        endMs: 10,
        confidenceBand: "reviewed",
      },
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.tags.length, 1);
  assert.equal(parsed.tags[0]?.profileHref, "/crew/safe");
  assert.equal(parsed.tags[0]?.bbox, null);
  assert.equal(parsed.tags[0]?.avatarUrl, undefined);
});
