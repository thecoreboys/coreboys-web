import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { buildCuratedChannelRails } from "../lib/watch/creator-platform-rails.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { buildNetworkChannelHub, NETWORK_CHANNELS } from "../lib/watch/channels.ts";
import type { XFeedMetadata } from "../components/feed/types";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const ADAPT = "adapt";

function watchItem(
  id: string,
  overrides: Partial<WatchItem> = {},
): WatchItem {
  const platform = overrides.platform ?? "youtube";
  const accountLabel = overrides.accountLabel ?? "Adapt · Main";
  return {
    id,
    kind: "youtube",
    platform,
    title: id,
    poster: `/fixtures/${id}.jpg`,
    backdrop: `/fixtures/${id}.jpg`,
    memberSlug: ADAPT,
    memberLabel: "Adapt",
    accountLabel,
    accent: "#ef4444",
    href: `/theater?id=${encodeURIComponent(id)}`,
    sourceUrl: `https://example.test/${platform}/${id}`,
    publishedAt: "2026-08-20T12:00:00.000Z",
    format: "long",
    orientation: "landscape",
    embeddable: true,
    ...overrides,
  };
}

function catalog(items: WatchItem[]): WatchCatalog {
  const members = ["adapt", "ron", "lacy", "marlon", "jason", "silky"];
  return {
    billboard: items[0] ?? null,
    all: items,
    live: items.filter((item) => item.kind === "live" || item.format === "live"),
    house: items.filter((item) => item.memberSlug === null),
    byMember: members.map((slug) => ({
      slug,
      label: slug,
      accent: "#ef4444",
      portrait: `/members/${slug}.jpg`,
      comm: slug,
      items: items.filter((item) => item.memberSlug === slug),
    })),
    videos: items.filter((item) => item.platform === "youtube" && item.format === "long"),
    shorts: items.filter((item) => item.format === "short"),
    broadcasts: items.filter((item) => item.kind === "vod"),
    clips: items.filter((item) => item.kind === "clip"),
    photos: items.filter((item) => item.format === "photo"),
    recent: items,
    byPlatform: {
      twitch: items.filter((item) => item.platform === "twitch"),
      youtube: items.filter((item) => item.platform === "youtube"),
      tiktok: items.filter((item) => item.platform === "tiktok"),
      instagram: items.filter((item) => item.platform === "instagram"),
      x: items.filter((item) => item.platform === "x"),
      house: items.filter((item) => item.platform === "house"),
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

function railFor(
  rails: ReturnType<typeof buildCuratedChannelRails>,
  platform: string,
  kind: string,
  accountLabel: string,
) {
  return rails.find((rail) =>
    rail.platform === platform &&
    rail.kind === kind &&
    rail.accountLabel === accountLabel
  );
}

function cachedXMetadata(statusId: string): XFeedMetadata {
  return {
    statusId,
    statusUrl: `https://x.com/FaZeAdapt/status/${statusId}`,
    authorId: "42",
    authorHandle: "@FaZeAdapt",
    authorName: "Adapt",
    authorProfileUrl: "https://x.com/FaZeAdapt",
    authorAvatarUrl: "https://pbs.twimg.com/profile_images/adapt.jpg",
    verified: true,
    noteText: "A complete cached X post from Adapt.",
  };
}

test("builds a complete, source-separated rail set for one member", () => {
  const items: WatchItem[] = [
    watchItem("twitch-live", {
      platform: "twitch", kind: "live", format: "live", accountLabel: "@adapt",
      sourceUrl: "https://www.twitch.tv/adapt",
    }),
    watchItem("twitch-vod", {
      platform: "twitch", kind: "vod", accountLabel: "@adapt",
      sourceUrl: "https://www.twitch.tv/videos/10001",
    }),
    watchItem("twitch-clip", {
      platform: "twitch", kind: "clip", accountLabel: "@adapt",
      sourceUrl: "https://www.twitch.tv/adapt/clip/CreatorClip10002",
    }),
    watchItem("youtube-live", {
      kind: "live", format: "live", accountLabel: "Adapt · Live",
      sourceUrl: "https://www.youtube.com/watch?v=yt-live",
    }),
    watchItem("youtube-replay", {
      kind: "vod", accountLabel: "Adapt · Live",
      sourceUrl: "https://www.youtube.com/watch?v=yt-replay",
    }),
    watchItem("youtube-main-video", {
      accountLabel: "Adapt · Main",
      sourceUrl: "https://www.youtube.com/watch?v=yt-main",
    }),
    watchItem("youtube-live-upload", {
      accountLabel: "Adapt · Live",
      sourceUrl: "https://www.youtube.com/watch?v=yt-live-upload",
    }),
    watchItem("youtube-main-short", {
      format: "short", orientation: "portrait", accountLabel: "Adapt · Main",
      sourceUrl: "https://www.youtube.com/shorts/yt-short",
    }),
    watchItem("tiktok-short", {
      platform: "tiktok", kind: "clip", format: "short", orientation: "portrait",
      accountLabel: "Adapt · @fazeadapt",
      sourceUrl: "https://www.tiktok.com/@fazeadapt/video/20001",
    }),
    watchItem("instagram-reel", {
      platform: "instagram", kind: "clip", format: "short", orientation: "portrait",
      accountLabel: "Adapt · @thefazeadapt",
      sourceUrl: "https://www.instagram.com/reel/reel-1/",
    }),
    watchItem("instagram-video", {
      platform: "instagram", kind: "clip", format: "long",
      accountLabel: "Adapt · @thefazeadapt",
      sourceUrl: "https://www.instagram.com/p/video-1/",
    }),
    watchItem("instagram-photo", {
      platform: "instagram", kind: "tour", format: "photo", orientation: "square",
      accountLabel: "Adapt · @thefazeadapt",
      sourceUrl: "https://www.instagram.com/p/photo-1/",
    }),
    watchItem("x-post", {
      platform: "x", kind: "post", accountLabel: "Adapt · @FaZeAdapt",
      sourceUrl: "https://x.com/FaZeAdapt/status/30001",
      x: cachedXMetadata("30001"),
    }),
    // A future/unknown provider must fail closed. Snapchat remains link-only.
    watchItem("snapchat-story", {
      platform: "snapchat" as WatchItem["platform"],
      kind: "post",
      accountLabel: "Adapt · @adaptsnaps",
      sourceUrl: "https://www.snapchat.com/add/adaptsnaps",
    }),
    watchItem("foreign-member", {
      memberSlug: "lacy", memberLabel: "Lacy", accountLabel: "Lacy · Main",
      sourceUrl: "https://www.youtube.com/watch?v=lacy-only",
    }),
  ];
  const network = NETWORK_CHANNELS.find((channel) => channel.slug === ADAPT);
  assert.ok(network);

  // This is the production call boundary: the hub scopes the catalog to the
  // requested member, then the platform selector curates that member's rails.
  const hub = buildNetworkChannelHub(catalog(items), network);
  const rails = buildCuratedChannelRails(hub.all);
  const selectedIds = rails.flatMap((rail) => rail.items.map((item) => item.id));

  assert.deepEqual(new Set(selectedIds), new Set([
    "twitch-live",
    "twitch-vod",
    "twitch-clip",
    "youtube-live",
    "youtube-replay",
    "youtube-main-video",
    "youtube-live-upload",
    "youtube-main-short",
    "tiktok-short",
    "instagram-reel",
    "instagram-video",
    "instagram-photo",
    "x-post",
  ]));
  assert.ok(rails.every((rail) => rail.items.every((item) => item.memberSlug === ADAPT)));
  assert.equal(rails.some((rail) => String(rail.platform) === "snapchat"), false);
  assert.equal(selectedIds.includes("foreign-member"), false);

  assert.ok(railFor(rails, "twitch", "live", "@adapt"));
  assert.ok(railFor(rails, "twitch", "broadcasts", "@adapt"));
  assert.ok(railFor(rails, "twitch", "videos", "@adapt"));
  assert.ok(railFor(rails, "youtube", "live", "Adapt · Live"));
  assert.ok(railFor(rails, "youtube", "broadcasts", "Adapt · Live"));
  assert.ok(railFor(rails, "youtube", "videos", "Adapt · Main"));
  assert.ok(railFor(rails, "youtube", "videos", "Adapt · Live"));
  assert.ok(railFor(rails, "youtube", "shorts", "Adapt · Main"));
  assert.ok(railFor(rails, "tiktok", "shorts", "Adapt · @fazeadapt"));
  assert.ok(railFor(rails, "instagram", "shorts", "Adapt · @thefazeadapt"));
  assert.ok(railFor(rails, "instagram", "videos", "Adapt · @thefazeadapt"));
  assert.ok(railFor(rails, "instagram", "posts", "Adapt · @thefazeadapt"));

  const xRail = railFor(rails, "x", "posts", "Adapt · @FaZeAdapt");
  assert.ok(xRail);
  assert.equal(xRail.items[0]?.x?.noteText, "A complete cached X post from Adapt.");
});

test("keeps every YouTube account visible while capping, sorting, and deduplicating within a source", () => {
  const items = [
    watchItem("main-newest", {
      accountLabel: "Adapt · Main", publishedAt: "2026-08-20T15:00:00Z",
      sourceUrl: "https://www.youtube.com/watch?v=main-newest",
    }),
    watchItem("main-next", {
      accountLabel: "Adapt · Main", publishedAt: "2026-08-20T14:00:00Z",
      sourceUrl: "https://www.youtube.com/watch?v=main-next",
    }),
    watchItem("main-shared", {
      accountLabel: "Adapt · Main", publishedAt: "2026-08-20T13:00:00Z",
      sourceUrl: "https://www.youtube.com/watch?v=shared&utm_source=one",
    }),
    watchItem("main-shared-copy", {
      accountLabel: "Adapt · Main", publishedAt: "2026-08-20T12:00:00Z",
      sourceUrl: "https://youtube.com/watch?v=shared&utm_source=two",
    }),
    watchItem("live-channel-video", {
      accountLabel: "Adapt · Live", publishedAt: "2026-08-19T12:00:00Z",
      sourceUrl: "https://www.youtube.com/watch?v=live-channel-video",
    }),
  ];

  const capped = buildCuratedChannelRails(items, { maxItemsPerSource: 2 });
  const main = railFor(capped, "youtube", "videos", "Adapt · Main");
  const live = railFor(capped, "youtube", "videos", "Adapt · Live");
  assert.ok(main);
  assert.ok(live);
  assert.deepEqual(main.items.map((item) => item.id), ["main-newest", "main-next"]);
  assert.deepEqual(live.items.map((item) => item.id), ["live-channel-video"]);

  const uncapped = buildCuratedChannelRails(items, { maxItemsPerSource: 8 });
  const uncappedMain = railFor(uncapped, "youtube", "videos", "Adapt · Main");
  assert.ok(uncappedMain);
  assert.deepEqual(uncappedMain.items.map((item) => item.id), [
    "main-newest",
    "main-next",
    "main-shared",
  ]);

  assert.equal(new Set(uncapped.map((rail) => rail.id)).size, uncapped.length);
  assert.equal(new Set(uncapped.map((rail) => rail.sourceKey)).size, 2);
  assert.deepEqual(
    buildCuratedChannelRails(items, { maxItemsPerSource: 8 }),
    uncapped,
  );
});

test("preserves configured connected sources during empty or failed upstream windows", () => {
  const rails = buildCuratedChannelRails([], {
    sources: [
      {
        platform: "youtube",
        label: "Adapt · Main",
        handle: "@Adapt",
        href: "https://www.youtube.com/@Adapt",
      },
      {
        platform: "youtube",
        label: "Adapt · Live",
        handle: "@FaZeAdaptLive",
        href: "https://www.youtube.com/@FaZeAdaptLive",
      },
      {
        platform: "tiktok",
        label: "Adapt · TikTok",
        handle: "@fazeadapt",
        href: "https://www.tiktok.com/@fazeadapt",
        ingestState: "vault_unavailable",
      },
      {
        platform: "instagram",
        label: "Adapt · Instagram",
        handle: "@thefazeadapt",
        href: "https://www.instagram.com/thefazeadapt",
        ingestState: "not_configured",
      },
      {
        platform: "x",
        label: "Adapt · X",
        handle: "@FaZeAdapt",
        href: "https://x.com/FaZeAdapt",
      },
      {
        platform: "snapchat",
        label: "Adapt · Snapchat",
        handle: "@adaptsnaps",
        href: "https://www.snapchat.com/add/adaptsnaps",
      },
      {
        platform: "wikipedia",
        label: "Adapt · Wikipedia",
        href: "https://en.wikipedia.org/wiki/FaZe_Adapt",
      },
    ],
  });

  assert.equal(rails.length, 5);
  assert.deepEqual(
    rails.map(({ platform, kind, accountLabel }) => ({ platform, kind, accountLabel })),
    [
      { platform: "youtube", kind: "videos", accountLabel: "Adapt · Live" },
      { platform: "youtube", kind: "videos", accountLabel: "Adapt · Main" },
      { platform: "tiktok", kind: "shorts", accountLabel: "Adapt · TikTok" },
      { platform: "instagram", kind: "posts", accountLabel: "Adapt · Instagram" },
      { platform: "x", kind: "posts", accountLabel: "Adapt · X" },
    ],
  );
  assert.ok(rails.every((rail) => rail.items.length === 0));
  assert.ok(rails.every((rail) => rail.sourceHref?.startsWith("https://")));
  assert.equal(
    rails.find((rail) => rail.platform === "tiktok")?.ingestState,
    "vault_unavailable",
  );
  assert.equal(
    rails.find((rail) => rail.platform === "instagram")?.ingestState,
    "not_configured",
  );
  assert.equal(new Set(rails.map((rail) => rail.sourceKey)).size, rails.length);
  assert.equal(rails.some((rail) => String(rail.platform) === "snapchat"), false);
  assert.equal(rails.some((rail) => String(rail.platform) === "wikipedia"), false);
});

test("uses a deterministic platform and content-kind order", () => {
  const rails = buildCuratedChannelRails([
    watchItem("x", { platform: "x", kind: "post", accountLabel: "@FaZeAdapt", sourceUrl: "https://x.com/FaZeAdapt/status/40001" }),
    watchItem("ig-photo", { platform: "instagram", kind: "tour", format: "photo", accountLabel: "@thefazeadapt" }),
    watchItem("ig-short", { platform: "instagram", kind: "clip", format: "short", accountLabel: "@thefazeadapt" }),
    watchItem("tiktok", { platform: "tiktok", kind: "clip", format: "short", accountLabel: "@fazeadapt" }),
    watchItem("yt-short", { format: "short", accountLabel: "Adapt · Main" }),
    watchItem("yt-video", { accountLabel: "Adapt · Main" }),
    watchItem("yt-replay", { kind: "vod", accountLabel: "Adapt · Live" }),
    watchItem("twitch-replay", { platform: "twitch", kind: "vod", accountLabel: "@adapt" }),
    watchItem("yt-live", { kind: "live", format: "live", accountLabel: "Adapt · Live" }),
    watchItem("twitch-live", { platform: "twitch", kind: "live", format: "live", accountLabel: "@adapt" }),
  ]);

  const positions = new Map(rails.map((rail, index) => [rail.id, index]));
  const indexes = (predicate: (rail: (typeof rails)[number]) => boolean) =>
    rails.filter(predicate).map((rail) => positions.get(rail.id)!);
  const liveIndexes = indexes((rail) => rail.kind === "live");
  const nonLiveIndexes = indexes((rail) => rail.kind !== "live");
  assert.ok(Math.max(...liveIndexes) < Math.min(...nonLiveIndexes));

  const twitchBroadcast = rails.findIndex((rail) => rail.platform === "twitch" && rail.kind === "broadcasts");
  const firstYouTubeNonLive = rails.findIndex((rail) => rail.platform === "youtube" && rail.kind !== "live");
  assert.ok(twitchBroadcast >= 0 && twitchBroadcast < firstYouTubeNonLive);

  const youtubeVideo = rails.findIndex((rail) => rail.platform === "youtube" && rail.kind === "videos" && rail.accountLabel === "Adapt · Main");
  const youtubeShort = rails.findIndex((rail) => rail.platform === "youtube" && rail.kind === "shorts" && rail.accountLabel === "Adapt · Main");
  assert.ok(youtubeVideo >= 0 && youtubeVideo < youtubeShort);

  const lastYouTube = Math.max(...indexes((rail) => rail.platform === "youtube"));
  const firstTikTok = Math.min(...indexes((rail) => rail.platform === "tiktok"));
  const lastTikTok = Math.max(...indexes((rail) => rail.platform === "tiktok"));
  const firstInstagram = Math.min(...indexes((rail) => rail.platform === "instagram"));
  const lastInstagram = Math.max(...indexes((rail) => rail.platform === "instagram"));
  const firstX = Math.min(...indexes((rail) => rail.platform === "x"));
  assert.ok(lastYouTube < firstTikTok);
  assert.ok(lastTikTok < firstInstagram);
  assert.ok(lastInstagram < firstX);
});

test("mounts curated rails on the member channel page with cache-only X cards and shared-player actions", () => {
  const page = readFileSync(
    resolve(process.cwd(), "components/watch/NetworkChannelPage.tsx"),
    "utf8",
  );
  const component = readFileSync(
    resolve(process.cwd(), "components/watch/CreatorPlatformRails.tsx"),
    "utf8",
  );

  assert.match(
    page,
    /<CreatorPlatformRails[\s\S]{0,300}items=\{nonXHubItems\}[\s\S]{0,300}sources=\{nonXSourceDescriptors\}[\s\S]{0,300}onPlay=\{playSourceItem\}/,
  );
  assert.match(page, /<XTweetsRail[\s\S]{0,300}items=\{ownerXPosts\}/);
  assert.match(page, /not posts from the X Community timeline/);
  assert.match(page, /player\.play\(item, \[\.\.\.sourceQueue\]\)/);
  assert.match(component, /selectWatchHomeXPosts/);
  assert.match(component, /<PosterCard/);
  assert.match(component, /className=\{`watch-shelf \$\{styles\.homeMediaRail\}`\}/);
  assert.match(component, /<XTweetsRail/);
  assert.match(component, /showHeading=\{false\}/);
  assert.doesNotMatch(component, /function CreatorPlatformCard/);
  assert.doesNotMatch(component, /function CachedXPostCard/);
  assert.match(component, /CORE does not have authorized media access/);
  assert.match(component, /cannot reach its encrypted social connection store/);
  assert.doesNotMatch(component, /Connected\. No recent posts/);
  assert.doesNotMatch(component, /XPostEmbed|loadXWidgets|api\.x\.com|api\.twitter\.com|fetch\s*\(/);
});
