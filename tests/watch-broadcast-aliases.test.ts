import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the explicit suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { markCrossPlatformBroadcastAliases } from "../lib/watch/broadcast-aliases.ts";
import type { WatchItem } from "../lib/watch/types";

function item(overrides: Partial<WatchItem>): WatchItem {
  return {
    id: "fixture",
    platform: "youtube",
    kind: "youtube",
    format: "long",
    title: "MARLON x CINNA! GYM AND EATS THAN REACTS!",
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug: "marlon",
    memberLabel: "Marlon",
    accent: "#fff",
    href: "/theater?kind=youtube&id=fixture",
    sourceUrl: "https://www.youtube.com/watch?v=fixture",
    publishedAt: "2026-08-21T17:49:02.000Z",
    embeddable: true,
    ...overrides,
  };
}

test("routes a same-title YouTube broadcast archive out of Videos", () => {
  const youtube = item({ id: "youtube-archive" });
  const twitch = item({
    id: "live-marlon",
    platform: "twitch",
    kind: "live",
    format: "live",
    title: "MARLON x CINNA!! GYM AND EATS THAN REACTS!!",
    href: "/watch/live/marlon",
    sourceUrl: "https://www.twitch.tv/marlon",
    publishedAt: "2026-08-21T17:54:28.000Z",
    live: { login: "marlon", startedAt: "2026-08-21T17:54:28.000Z" },
  });

  const result = markCrossPlatformBroadcastAliases([youtube, twitch]);
  assert.equal(result[0]?.kind, "vod");
  assert.equal(result[0]?.format, "long");
  assert.equal(result[0]?.platform, "youtube");
  assert.equal(result[0]?.href, youtube.href);
  assert.equal(result[0]?.live?.startedAt, youtube.publishedAt);
});

test("does not reclassify an ordinary upload from a weak resemblance", () => {
  const youtube = item({ id: "ordinary", title: "Marlon goes to the gym" });
  const twitch = item({
    id: "live-marlon",
    platform: "twitch",
    kind: "live",
    format: "live",
    title: "Marlon live from the gym",
    href: "/watch/live/marlon",
    sourceUrl: "https://www.twitch.tv/marlon",
    publishedAt: "2026-08-21T17:54:28.000Z",
  });

  assert.equal(markCrossPlatformBroadcastAliases([youtube, twitch])[0]?.kind, "youtube");
});

test("routes videos from a dedicated YouTube VOD account as past broadcasts", () => {
  const youtube = item({
    id: "marlon-vod-account",
    accountLabel: "Marlon · VODs",
    subtitle: "Marlon · VODs",
  });

  const result = markCrossPlatformBroadcastAliases([youtube]);
  assert.equal(result[0]?.kind, "vod");
  assert.equal(result[0]?.subtitle, "Marlon · Past broadcast");
  assert.equal(result[0]?.live?.startedAt, youtube.publishedAt);
});

test("keeps ordinary Main and Live account uploads as videos without broadcast evidence", () => {
  const main = item({ id: "main-upload", accountLabel: "Marlon · Main" });
  const liveChannelUpload = item({ id: "live-upload", accountLabel: "Marlon · Live" });

  const result = markCrossPlatformBroadcastAliases([main, liveChannelUpload]);
  assert.equal(result[0]?.kind, "youtube");
  assert.equal(result[1]?.kind, "youtube");
});

test("uses the VOD subtitle when an account label is unavailable", () => {
  const youtube = item({
    id: "jason-vod-account",
    memberSlug: "jason",
    memberLabel: "JasonTheWeen",
    accountLabel: undefined,
    subtitle: "JasonTheWeen · VODs",
  });

  assert.equal(markCrossPlatformBroadcastAliases([youtube])[0]?.kind, "vod");
});

test("does not turn a Short from a VOD account into a broadcast", () => {
  const short = item({
    id: "vod-account-short",
    accountLabel: "Marlon · VODs",
    format: "short",
    orientation: "portrait",
  });

  assert.equal(markCrossPlatformBroadcastAliases([short])[0]?.kind, "youtube");
});

test("requires the same creator and a tight broadcast window", () => {
  const youtube = item({ id: "youtube-archive" });
  const otherCreator = item({
    id: "live-other",
    platform: "twitch",
    kind: "live",
    format: "live",
    memberSlug: "adapt",
    title: youtube.title,
    publishedAt: "2026-08-21T17:54:28.000Z",
  });
  const muchLater = item({
    id: "live-later",
    platform: "twitch",
    kind: "vod",
    memberSlug: "marlon",
    title: youtube.title,
    publishedAt: "2026-08-21T20:00:00.000Z",
  });

  assert.equal(markCrossPlatformBroadcastAliases([youtube, otherCreator, muchLater])[0]?.kind, "youtube");
});
