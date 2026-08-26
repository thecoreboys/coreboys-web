import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMultiviewLiveRoom,
  clampMultiviewItems,
  effectiveMultiviewFillLimit,
  EXPANDED_MULTIVIEW_TILE_LIMIT,
  FREE_MULTIVIEW_TILE_LIMIT,
  restrictCatalogForLiveRoom,
} from "../lib/watch/multiview-access";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function item(id: string, kind: WatchItem["kind"] = "live"): WatchItem {
  return {
    id,
    kind,
    platform: kind === "live" ? "twitch" : "youtube",
    title: `Secret title ${id}`,
    poster: `https://images.example/${id}.jpg`,
    backdrop: `https://images.example/${id}-backdrop.jpg`,
    memberSlug: id,
    memberLabel: id.toUpperCase(),
    accent: "#ec0063",
    href: `/watch/${id}`,
    sourceUrl: `https://twitch.tv/${id}`,
    embedUrl: `https://player.twitch.tv/?channel=${id}`,
    mediaUrl: `https://media.example/${id}.m3u8`,
    live: kind === "live" ? {
      login: id,
      streamId: `stream-${id}`,
      viewers: 100,
    } : undefined,
  };
}

function catalog(items: WatchItem[]): WatchCatalog {
  const live = items.filter((entry) => entry.kind === "live");
  const videos = items.filter((entry) => entry.kind !== "live");
  return {
    billboard: items[2] ?? items[0] ?? null,
    all: [...items],
    live: [...live],
    house: [...items],
    byMember: [{ slug: "core", label: "CORE", accent: "#fff", portrait: "", comm: "CORE", items: [...items] }],
    videos: [...videos],
    shorts: [...items],
    broadcasts: [...items],
    clips: [...items],
    photos: [...items],
    recent: [...items],
    byPlatform: {
      twitch: [...live],
      youtube: [...videos],
      tiktok: [...items],
      instagram: [...items],
      x: [...items],
      house: [...items],
    },
    liveCapabilities: {
      twitch: "supported",
      x: "unsupported",
      tiktok: "unsupported",
      instagram: "unsupported",
    },
    heroFeatured: [...items],
    programmingSections: [{ id: "featured", title: "Featured", layout: "standard", items: [...items] }],
    fetchedAt: new Date(0).toISOString(),
  };
}

test("free all-live rooms expose two playables and metadata-free locks", () => {
  const live = [item("alpha"), item("bravo"), item("charlie"), item("delta")];
  const room = buildMultiviewLiveRoom(live, false);

  assert.equal(room.tileLimit, FREE_MULTIVIEW_TILE_LIMIT);
  assert.deepEqual(room.playableItems.map((entry) => entry.id), ["alpha", "bravo"]);
  assert.deepEqual(room.lockedSlots, [
    { id: "locked-live-3", ordinal: 3, locked: true },
    { id: "locked-live-4", ordinal: 4, locked: true },
  ]);

  const serializedLocks = JSON.stringify(room.lockedSlots).toLowerCase();
  for (const forbidden of [
    "title", "login", "channel", "streamid", "sourceurl", "mediaurl",
    "embedurl", "poster", "thumbnail", "twitch", "youtube", "href",
  ]) {
    assert.equal(serializedLocks.includes(forbidden), false, `locked DTO leaked ${forbidden}`);
  }
});

test("expanded rooms receive at most the configured 12 playable streams", () => {
  const live = Array.from({ length: 14 }, (_, index) => item(`live-${index + 1}`));
  const room = buildMultiviewLiveRoom(live, true);
  assert.equal(room.tileLimit, EXPANDED_MULTIVIEW_TILE_LIMIT);
  assert.equal(room.playableItems.length, 12);
  assert.equal(room.lockedSlots.length, 2);
});

test("callers and forged stored workspaces cannot raise an entitlement cap", () => {
  assert.equal(effectiveMultiviewFillLimit(2, 12), 2);
  assert.equal(effectiveMultiviewFillLimit(12, 4), 4);
  assert.equal(effectiveMultiviewFillLimit(12, 99), 12);
  assert.deepEqual(clampMultiviewItems(["one", "two", "three", "four"], 2), ["one", "two"]);
});

test("non-live catalog entries do not consume live-room capacity", () => {
  const room = buildMultiviewLiveRoom([
    item("video", "youtube"),
    item("alpha"),
    item("bravo"),
    item("charlie"),
  ], false);
  assert.deepEqual(room.playableItems.map((entry) => entry.id), ["alpha", "bravo"]);
  assert.equal(room.totalLive, 3);
});

test("restricted live-room catalogs remove denied transports from every nested surface", () => {
  const entries = [item("alpha"), item("bravo"), item("charlie"), item("video", "youtube")];
  const source = catalog(entries);
  const room = buildMultiviewLiveRoom(source.live, false);
  const restricted = restrictCatalogForLiveRoom(source, room);
  const payload = JSON.stringify(restricted);

  assert.equal(payload.includes("charlie"), false);
  assert.equal(payload.includes("channel=charlie"), false);
  assert.equal(payload.includes("video"), true, "non-live content should remain available");
  assert.deepEqual(restricted.live.map((entry) => entry.id), ["alpha", "bravo"]);
  assert.deepEqual(restricted.byMember[0]?.items.map((entry) => entry.id), ["alpha", "bravo", "video"]);
  assert.deepEqual(restricted.programmingSections?.[0]?.items.map((entry) => entry.id), ["alpha", "bravo", "video"]);
});

test("the locked UI branch cannot mount provider media and the modal links to live=all", () => {
  const stageSource = readFileSync(
    new URL("../components/watch/MultiPlayerStage.tsx", import.meta.url),
    "utf8",
  );
  const lockedBranch = stageSource.slice(
    stageSource.indexOf("function LockedLiveTile"),
    stageSource.indexOf("function PlayerTile"),
  );
  assert.ok(lockedBranch.includes("data-locked-live-slot"));
  for (const forbidden of ["<iframe", "<video", "<audio", "<source", "<img", "embedFor(", ".poster", ".twitchLogin"]) {
    assert.equal(lockedBranch.includes(forbidden), false, `locked UI mounted ${forbidden}`);
  }

  const modalSource = readFileSync(
    new URL("../components/live/LiveNowModal.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(modalSource.includes('href="/multiview?live=all"'));
  assert.ok(modalSource.includes("min-h-0 flex-1"));
  assert.ok(modalSource.includes("lg:grid-cols-4"));
});
