import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires explicit TypeScript suffixes.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { buildNetworkActivity, buildNetworkChannelLineup, NETWORK_CHANNELS } from "../lib/watch/channels.ts";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { normalizeWatchItems } from "../lib/watch/normalize.ts";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const MEMBER_LABELS: Record<string, string> = {
  adapt: "Adapt",
  ron: "StableRonaldo",
  lacy: "Lacy",
  marlon: "Marlon",
  jason: "JasonTheWeen",
  silky: "Silky",
};

function short(
  id: string,
  memberSlug: string | null,
  platform: "youtube" | "instagram" | "tiktok",
  overrides: Partial<WatchItem> = {},
): WatchItem {
  const providerPath = platform === "youtube"
    ? `shorts/${id}`
    : platform === "instagram"
      ? `reel/${id}`
      : `@core/video/${id}`;
  return {
    id,
    platform,
    kind: platform === "youtube" ? "youtube" : "clip",
    format: "short",
    orientation: "portrait",
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug,
    memberLabel: memberSlug ? MEMBER_LABELS[memberSlug] ?? memberSlug : "CORE",
    accountLabel: memberSlug ? `${MEMBER_LABELS[memberSlug] ?? memberSlug} main` : "CORE main",
    accent: "#ef4444",
    href: `/theater?kind=clip&id=${id}`,
    sourceUrl: `https://www.${platform}.com/${providerPath}`,
    publishedAt: "2026-08-20T12:00:00.000Z",
    embeddable: true,
    ...overrides,
  };
}

function catalog(all: WatchItem[]): WatchCatalog {
  return {
    billboard: all[0] ?? null,
    all,
    live: [],
    house: [],
    byMember: [],
    videos: all.filter((item) => item.platform === "youtube" && item.format === "long"),
    shorts: all.filter((item) => item.format === "short"),
    broadcasts: [],
    clips: [],
    photos: all.filter((item) => item.format === "photo"),
    recent: all,
    byPlatform: {
      twitch: all.filter((item) => item.platform === "twitch"),
      youtube: all.filter((item) => item.platform === "youtube"),
      tiktok: all.filter((item) => item.platform === "tiktok"),
      instagram: all.filter((item) => item.platform === "instagram"),
      x: all.filter((item) => item.platform === "x"),
      house: all.filter((item) => item.platform === "house"),
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

function coreChannel() {
  const core = NETWORK_CHANNELS.find((channel) => channel.slug === "core");
  assert.ok(core);
  return core;
}

test("CORE Shorts aggregates connected Shorts, Reels, and TikToks from every CORE member", () => {
  const raw: WatchItem[] = [
    short("core-youtube", null, "youtube"),
    short("adapt-youtube", "adapt", "youtube"),
    short("ron-tiktok", "ron", "tiktok"),
    short("lacy-instagram", "lacy", "instagram", {
      sourceUrl: "https://www.instagram.com/reel/shared-lacy/?utm_source=tests",
    }),
    // The same provider post can arrive through multiple feed adapters. It
    // must appear only once in the channel.
    short("lacy-instagram-copy", "lacy", "instagram", {
      sourceUrl: "https://instagram.com/reel/shared-lacy",
    }),
    short("marlon-youtube", "marlon", "youtube"),
    short("jason-tiktok", "jason", "tiktok"),
    short("silky-instagram", "silky", "instagram"),
    short("core-long", null, "youtube", {
      format: "long",
      orientation: "landscape",
      sourceUrl: "https://www.youtube.com/watch?v=core-long",
    }),
    short("youtube-long", "adapt", "youtube", {
      format: "long",
      orientation: "landscape",
      sourceUrl: "https://www.youtube.com/watch?v=youtube-long",
    }),
    short("instagram-photo", "ron", "instagram", { format: "photo", kind: "tour" }),
    short("clip-fan-submission", "jason", "tiktok"),
    short("blocked-short", "silky", "youtube", { embeddable: false }),
    {
      ...short("x-short", "marlon", "youtube"),
      platform: "x",
      kind: "post",
    },
  ];
  const input = catalog(normalizeWatchItems(raw));
  const lineup = buildNetworkChannelLineup(input, coreChannel(), "shorts");

  assert.deepEqual(
    new Set(lineup.map((item) => item.id)),
    new Set([
      "core-youtube",
      "adapt-youtube",
      "ron-tiktok",
      "lacy-instagram",
      "marlon-youtube",
      "jason-tiktok",
      "silky-instagram",
    ]),
  );
  assert.deepEqual(new Set(lineup.map((item) => item.platform)), new Set(["youtube", "instagram", "tiktok"]));
  assert.deepEqual(
    new Set(lineup.map((item) => item.memberSlug)),
    new Set([null, "adapt", "ron", "lacy", "marlon", "jason", "silky"]),
  );
  assert.equal(new Set(lineup.map((item) => item.sourceUrl)).size, lineup.length);
  assert.deepEqual(
    new Set(buildNetworkActivity(input, coreChannel(), "shorts").map(({ item }) => item.id)),
    new Set(lineup.map((item) => item.id)),
  );
  assert.deepEqual(
    buildNetworkChannelLineup(input, coreChannel(), "videos").map((item) => item.id),
    ["core-long"],
  );
  const adapt = NETWORK_CHANNELS.find((channel) => channel.slug === "adapt");
  assert.ok(adapt);
  assert.deepEqual(
    buildNetworkChannelLineup(input, adapt, "shorts").map((item) => item.id),
    ["adapt-youtube"],
  );
});

test("CORE Shorts uses a deterministic source-balanced shuffle", () => {
  const items = normalizeWatchItems([
    ...Array.from({ length: 5 }, (_, index) => short(`adapt-${index}`, "adapt", "youtube", {
      publishedAt: new Date(Date.UTC(2026, 7, 20, 15, 0, index)).toISOString(),
    })),
    short("adapt-tiktok", "adapt", "tiktok"),
    short("adapt-instagram", "adapt", "instagram"),
    short("core-one", null, "youtube"),
    short("ron-one", "ron", "tiktok"),
    short("lacy-one", "lacy", "instagram"),
    short("marlon-one", "marlon", "youtube"),
    short("jason-one", "jason", "tiktok"),
    short("silky-one", "silky", "instagram"),
  ]);
  const input = catalog(items);
  const first = buildNetworkChannelLineup(input, coreChannel(), "shorts");
  const second = buildNetworkChannelLineup(input, coreChannel(), "shorts");
  const ids = first.map((item) => item.id);

  // Random-looking rails must still hydrate and replay identically.
  assert.deepEqual(ids, second.map((item) => item.id));

  // A creator with a deep catalog must not monopolize the start of the rail:
  // each connected member/account gets a turn before any source repeats.
  const sourceKey = (item: WatchItem) => `${item.memberSlug ?? "core"}:${item.platform}:${item.accountLabel ?? "main"}`;
  const uniqueSources = new Set(first.map(sourceKey));
  const openingSources = first.slice(0, uniqueSources.size).map(sourceKey);
  assert.equal(new Set(openingSources).size, uniqueSources.size);

  // This should be a programmed mix, not a newest-first feed.
  assert.notDeepEqual(ids, items.map((item) => item.id));
});
