import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { buildGuideNetworkRows, buildNetworkChannelHub, buildNetworkChannelLineup, NETWORK_CHANNELS } from "../lib/watch/channels.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { normalizeWatchItems } from "../lib/watch/normalize.ts";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function item(
  id: string,
  platform: WatchItem["platform"],
  kind: WatchItem["kind"],
  format: WatchItem["format"],
): WatchItem {
  return {
    id,
    platform,
    kind,
    format,
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#ef4444",
    href: `/theater?kind=${kind}&id=${id}`,
    sourceUrl: `https://example.test/${platform}/${id}`,
    publishedAt: "2026-08-20T12:00:00.000Z",
    embeddable: format !== "photo",
  };
}

function catalog(all: WatchItem[]): WatchCatalog {
  return {
    billboard: all[0] ?? null,
    all,
    live: all.filter((entry) => entry.kind === "live"),
    house: [],
    byMember: [],
    videos: [],
    shorts: [],
    broadcasts: [],
    clips: [],
    photos: [],
    recent: [],
    byPlatform: {
      twitch: [],
      youtube: [],
      tiktok: [],
      instagram: [],
      x: [],
      house: [],
    },
    liveCapabilities: {
      twitch: "supported",
      x: "not_configured",
      tiktok: "unsupported",
      instagram: "unsupported",
    },
    fetchedAt: "2026-08-20T12:00:00.000Z",
  };
}

test("routes every connected video type to the intended network row", () => {
  const twitchLive = item("live-adapt", "twitch", "live", "live");
  const twitchBroadcast = item("vod-1", "twitch", "vod", "long");
  const youtubeBroadcast = item("yt-vod", "youtube", "vod", "long");
  const youtubeVideo = item("yt-long", "youtube", "youtube", "long");
  const youtubeShort = item("yt-short", "youtube", "youtube", "short");
  const tiktok = item("tt-1", "tiktok", "clip", "short");
  const instagramReel = item("ig-reel", "instagram", "clip", "short");
  const instagramPhoto = item("ig-photo", "instagram", "tour", "photo");
  const input = catalog(normalizeWatchItems([
    twitchLive,
    twitchBroadcast,
    youtubeBroadcast,
    youtubeVideo,
    youtubeShort,
    tiktok,
    instagramReel,
    instagramPhoto,
  ]));
  const network = NETWORK_CHANNELS.find((entry) => entry.slug === "adapt");
  assert.ok(network);

  assert.deepEqual(
    buildNetworkChannelLineup(input, network, "live").map((entry) => entry.id),
    ["live-adapt", "vod-1", "yt-vod"],
  );
  assert.deepEqual(
    buildNetworkChannelLineup(input, network, "videos").map((entry) => entry.id),
    ["yt-long"],
  );
  assert.deepEqual(
    new Set(buildNetworkChannelLineup(input, network, "shorts").map((entry) => entry.id)),
    new Set(["yt-short", "tt-1", "ig-reel"]),
  );
  assert.deepEqual(
    new Set(buildNetworkChannelLineup(input, network, "continuous").map((entry) => entry.id)),
    new Set(["live-adapt", "vod-1", "yt-vod", "yt-long", "yt-short", "tt-1", "ig-reel"]),
  );

  // Photos intentionally stay out of video rows, but remain in catalog.all;
  // the Guide's chronological timeline consumes that complete collection.
  assert.equal(input.all.find((entry) => entry.id === "ig-photo")?.format, "photo");
});

test("builds the Guide timeline in one stable four-column network order", () => {
  const input = catalog(normalizeWatchItems([
    item("live-adapt", "twitch", "live", "live"),
    item("vod-adapt", "twitch", "vod", "long"),
    item("video-adapt", "youtube", "youtube", "long"),
    item("short-adapt", "youtube", "youtube", "short"),
  ]));

  const groups = buildGuideNetworkRows(input);
  assert.deepEqual(
    groups.map((group) => group.network.slug),
    ["core", "adapt", "ron", "lacy", "marlon", "jason", "silky"],
  );
  assert.deepEqual(
    groups[0]?.rows.map((row) => row.kind),
    ["videos", "shorts", "continuous"],
  );
  for (const group of groups.slice(1)) {
    assert.deepEqual(
      group.rows.map((row) => row.kind),
      ["live", "videos", "shorts", "continuous"],
    );
  }

  const rows = groups.flatMap((group) => group.rows);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.equal(new Set(rows.map((row) => row.channel.id)).size, rows.length);
  assert.equal(
    groups.find((group) => group.network.slug === "adapt")
      ?.rows.find((row) => row.kind === "live")
      ?.timelineSlug,
    "adapt",
  );
  assert.equal(
    groups.find((group) => group.network.slug === "core")
      ?.rows.find((row) => row.kind === "continuous")
      ?.timelineSlug,
    "house",
  );
});

test("builds complete, non-overlapping creator hub shelves", () => {
  const entries = normalizeWatchItems([
    item("live-adapt", "twitch", "live", "live"),
    item("vod-adapt", "twitch", "vod", "long"),
    item("video-adapt", "youtube", "youtube", "long"),
    item("short-adapt", "youtube", "youtube", "short"),
    item("tiktok-adapt", "tiktok", "clip", "short"),
    item("reel-adapt", "instagram", "clip", "short"),
    item("photo-adapt", "instagram", "tour", "photo"),
    item("tweet-adapt", "x", "post", "long"),
    item("tweet-photo-adapt", "x", "tour", "photo"),
    item("clip-adapt", "twitch", "clip", "long"),
  ]);
  const input = catalog(entries);
  const network = NETWORK_CHANNELS.find((entry) => entry.slug === "adapt");
  assert.ok(network);

  const hub = buildNetworkChannelHub(input, network);
  assert.deepEqual(hub.live.map((entry) => entry.id), ["live-adapt"]);
  assert.deepEqual(hub.broadcasts.map((entry) => entry.id), ["vod-adapt"]);
  assert.deepEqual(hub.videos.map((entry) => entry.id), ["video-adapt"]);
  assert.deepEqual(
    new Set(hub.shorts.map((entry) => entry.id)),
    new Set(["short-adapt", "tiktok-adapt", "reel-adapt"]),
  );
  assert.deepEqual(hub.photos.map((entry) => entry.id), ["photo-adapt"]);
  assert.deepEqual(
    new Set(hub.xPosts.map((entry) => entry.id)),
    new Set(["tweet-adapt", "tweet-photo-adapt"]),
  );
  assert.deepEqual(hub.clips.map((entry) => entry.id), ["clip-adapt"]);
  assert.equal(
    hub.live.length + hub.broadcasts.length + hub.videos.length + hub.shorts.length +
      hub.photos.length + hub.xPosts.length + hub.clips.length + hub.more.length,
    hub.all.length,
  );
});

test("admin community sources enter only explicitly assigned network rows", () => {
  const communityShort = {
    ...item("yt-community-short", "youtube", "youtube", "short"),
    memberSlug: null,
    memberLabel: "Community creator",
    programming: {
      community: true as const,
      sourceId: "source-1",
      routes: [
        { networkSlug: "adapt" as const, channelMode: "shorts" as const },
        { networkSlug: "core" as const, channelMode: "continuous" as const },
      ],
    },
  };
  const input = catalog(normalizeWatchItems([communityShort]));
  const adapt = NETWORK_CHANNELS.find((entry) => entry.slug === "adapt");
  const core = NETWORK_CHANNELS.find((entry) => entry.slug === "core");
  const ron = NETWORK_CHANNELS.find((entry) => entry.slug === "ron");
  assert.ok(adapt && core && ron);

  assert.deepEqual(buildNetworkChannelLineup(input, adapt, "shorts").map((entry) => entry.id), [communityShort.id]);
  assert.deepEqual(buildNetworkChannelLineup(input, adapt, "videos"), []);
  assert.deepEqual(buildNetworkChannelLineup(input, adapt, "continuous"), []);
  assert.deepEqual(buildNetworkChannelLineup(input, core, "continuous").map((entry) => entry.id), [communityShort.id]);
  assert.deepEqual(buildNetworkChannelLineup(input, core, "shorts"), []);
  assert.deepEqual(buildNetworkChannelLineup(input, ron, "shorts"), []);
  assert.deepEqual(buildNetworkChannelHub(input, adapt).shorts.map((entry) => entry.id), [communityShort.id]);
  assert.deepEqual(buildNetworkChannelHub(input, ron).all, []);
});
