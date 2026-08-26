import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentTwitchArchive,
  reconcileActiveTwitchArchives,
} from "../lib/watch/active-twitch-archives";
import { itemToPlayable } from "../lib/watch/playable";
import type { WatchItem } from "../lib/watch/types";

function item(
  id: string,
  kind: WatchItem["kind"],
  overrides: Partial<WatchItem> = {},
): WatchItem {
  return {
    id,
    kind,
    platform: "twitch",
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug: "ron",
    memberLabel: "StableRonaldo",
    accent: "#fff",
    href: kind === "live"
      ? "/watch/live/StableRonaldo"
      : `/theater?kind=vod&id=${id.replace("vod-", "")}&slug=ron`,
    format: kind === "live" ? "live" : "long",
    orientation: "landscape",
    ...overrides,
  };
}

const live = item("live-ron", "live", {
  publishedAt: "2026-08-20T21:12:29.000Z",
  live: {
    login: "StableRonaldo",
    startedAt: "2026-08-20T21:12:29.000Z",
    streamId: "319989284188",
  },
  twitch: { streamId: "319989284188" },
});

test("folds the exact active Twitch archive into live rewind metadata", () => {
  const archive = item("vod-2851780769", "vod", {
    publishedAt: "2026-08-20T21:12:44.000Z",
    durationSeconds: 4_937,
    twitch: { streamId: "319989284188", vodId: "2851780769" },
  });

  const result = reconcileActiveTwitchArchives([archive], [live]);
  assert.deepEqual(result.broadcasts, []);
  assert.deepEqual(result.liveItems[0]?.dvr, {
    enabled: true,
    twitchVodId: "2851780769",
    windowSeconds: 4_937,
  });
  assert.equal(itemToPlayable(result.liveItems[0]!)?.dvr?.twitchVodId, "2851780769");
});

test("provider stream ids prevent a nearby broadcast from being merged", () => {
  const nearbyDifferentStream = item("vod-restart", "vod", {
    publishedAt: "2026-08-20T21:12:34.000Z",
    durationSeconds: 120,
    twitch: { streamId: "different-session", vodId: "restart" },
  });

  assert.equal(isCurrentTwitchArchive(nearbyDifferentStream, live), false);
  assert.deepEqual(
    reconcileActiveTwitchArchives([nearbyDifferentStream], [live]).broadcasts,
    [nearbyDifferentStream],
  );
});

test("falls back to channel, start time, and overlap for legacy payloads", () => {
  const archive = item("vod-legacy", "vod", {
    publishedAt: "2026-08-20T21:12:44.000Z",
    durationSeconds: 600,
    twitch: { vodId: "legacy" },
  });
  const legacyLive = item("live-legacy", "live", {
    publishedAt: "2026-08-20T21:12:29.000Z",
    live: { login: "StableRonaldo", startedAt: "2026-08-20T21:12:29.000Z" },
  });

  assert.equal(isCurrentTwitchArchive(archive, legacyLive), true);
});

test("keeps older broadcasts and a completed stream followed by a quick restart", () => {
  const legacyLive = item("live-legacy", "live", {
    publishedAt: "2026-08-20T21:12:29.000Z",
    live: { login: "StableRonaldo", startedAt: "2026-08-20T21:12:29.000Z" },
  });
  const older = item("vod-older", "vod", {
    publishedAt: "2026-08-20T18:00:00.000Z",
    durationSeconds: 7_200,
    twitch: { vodId: "older" },
  });
  const completed = item("vod-completed", "vod", {
    publishedAt: "2026-08-20T21:11:00.000Z",
    durationSeconds: 60,
    twitch: { vodId: "completed" },
  });

  assert.equal(isCurrentTwitchArchive(older, legacyLive), false);
  assert.equal(isCurrentTwitchArchive(completed, legacyLive), false);
});

test("fails open for malformed timestamps and leaves other creators untouched", () => {
  const malformed = item("vod-malformed", "vod", {
    publishedAt: "not-a-date",
    twitch: { vodId: "malformed" },
  });
  const otherCreator = item("vod-marlon", "vod", {
    memberSlug: "marlon",
    publishedAt: "2026-08-20T21:12:34.000Z",
    durationSeconds: 600,
    twitch: { vodId: "marlon" },
  });

  assert.equal(isCurrentTwitchArchive(malformed, { ...live, twitch: undefined }), false);
  assert.equal(isCurrentTwitchArchive(otherCreator, { ...live, twitch: undefined }), false);
});
