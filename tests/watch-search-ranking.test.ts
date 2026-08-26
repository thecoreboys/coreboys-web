import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error Node type stripping requires the explicit suffix.
import { boundedLiveBoost, canonicalWatchKey, rankWatchCatalog } from "../lib/watch/discovery.ts";
import type { WatchItem, WatchPlatform } from "../lib/watch/types.ts";

function item(input: {
  id: string;
  platform?: WatchPlatform;
  title: string;
  memberSlug?: string;
  memberLabel?: string;
  kind?: WatchItem["kind"];
  format?: WatchItem["format"];
  publishedAt?: string;
  durationSeconds?: number;
}): WatchItem {
  return {
    id: input.id,
    platform: input.platform ?? "youtube",
    title: input.title,
    memberSlug: input.memberSlug ?? "adapt",
    memberLabel: input.memberLabel ?? "Adapt",
    kind: input.kind ?? "youtube",
    format: input.format ?? "long",
    publishedAt: input.publishedAt,
    durationSeconds: input.durationSeconds,
    poster: "/poster.jpg",
    backdrop: "/backdrop.jpg",
    accent: "#fff",
    href: `/watch/${input.id}`,
  };
}

test("canonical search identity is platform-qualified and dedupes only identical assets", () => {
  const youtube = item({ id: "shared", title: "CORE challenge" });
  const twitch = item({ id: "shared", platform: "twitch", title: "CORE challenge", kind: "vod" });
  const results = rankWatchCatalog({ items: [youtube, youtube, twitch], query: "core" });
  assert.deepEqual(results.map((result) => result.key).sort(), ["twitch:shared", "youtube:shared"]);
  assert.equal(canonicalWatchKey(youtube), "youtube:shared");
});

test("literal titles, creators, and concept aliases rank ahead of fuzzy discovery", () => {
  const exactTitle = item({ id: "exact", title: "Adapt", memberSlug: "lacy", memberLabel: "Lacy" });
  const exactCreator = item({ id: "creator", title: "A calm house stream", memberSlug: "adapt", memberLabel: "Adapt" });
  const fuzzy = item({ id: "fuzzy", title: "Adappt tries a challenge", memberSlug: "lacy", memberLabel: "Lacy" });
  const ranked = rankWatchCatalog({ items: [fuzzy, exactCreator, exactTitle], query: "adapt" });
  assert.deepEqual(ranked.slice(0, 2).map((result) => result.item.id), ["exact", "creator"]);

  const alias = item({ id: "alias", title: "Dating show with 20 women", memberSlug: "jason", memberLabel: "JasonTheWeen" });
  assert.equal(rankWatchCatalog({ items: [alias], query: "20v1" })[0]?.item.id, "alias");

  const typo = item({ id: "typo", title: "New upload", memberSlug: "jshock", memberLabel: "JShock" });
  assert.equal(rankWatchCatalog({ items: [typo], query: "jshok" })[0]?.item.id, "typo");
});

test("live preference is relevance-gated and bounded", () => {
  assert.equal(boundedLiveBoost(0.34, true, true), 0);
  assert.ok(boundedLiveBoost(1, true, true) <= 0.035);
  assert.equal(boundedLiveBoost(1, false, true), 0);
  assert.equal(boundedLiveBoost(1, true, false), 0);

  const relevant = item({ id: "adapt", title: "Adapt challenge" });
  const unrelatedLive = item({
    id: "live", platform: "twitch", title: "Cooking with Lacy", memberSlug: "lacy",
    memberLabel: "Lacy", kind: "live", format: "live",
  });
  assert.deepEqual(rankWatchCatalog({ items: [unrelatedLive, relevant], query: "adapt" }).map((result) => result.item.id), ["adapt"]);
});

test("catalog filters cover broadcasts, platform, member, date, duration, and watch state", () => {
  const broadcast = item({
    id: "broadcast", platform: "twitch", title: "Adapt replay", kind: "vod",
    publishedAt: "2026-08-10T12:00:00.000Z", durationSeconds: 3_600,
  });
  const post = item({
    id: "post", platform: "x", title: "Adapt posted", kind: "post", format: undefined,
    publishedAt: "2026-08-12T12:00:00.000Z",
  });
  const results = rankWatchCatalog({
    items: [post, broadcast],
    query: "adapt",
    filters: {
      platforms: ["twitch"],
      memberSlug: "adapt",
      contentTypes: ["broadcast"],
      publishedAfter: "2026-08-01T00:00:00.000Z",
      publishedBefore: "2026-08-31T23:59:59.999Z",
      minDurationSeconds: 1_800,
      maxDurationSeconds: 7_200,
      watchState: "continue",
      progressByRef: {
        "twitch:broadcast": {
          seconds: 120,
          progress: 0.4,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });
  assert.deepEqual(results.map((result) => result.key), ["twitch:broadcast"]);
});

test("search requests never run catalog indexing and publish truthful result metadata", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/watch/search/route.ts"), "utf8");
  assert.doesNotMatch(source, /syncCurrentWatchCatalog|params\.get\("refresh"\)/);
  assert.match(source, /requestedMode === "basic" \|\| !context\.access\.semantic/);
  assert.match(source, /total: search\.total/);
  assert.match(source, /contentTypes/);
  assert.match(source, /watchProgressAvailable/);
  assert.match(source, /deepAnalyzedAssets: null/);
});
