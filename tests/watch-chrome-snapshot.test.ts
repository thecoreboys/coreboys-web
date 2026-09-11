import assert from "node:assert/strict";
import test from "node:test";
import { watchChromeSnapshot, WATCH_CHROME_RECOMMENDATION_LIMIT } from "../lib/watch/chrome-snapshot";
import { dvrItemReferences } from "../lib/watch/dvr-item-references";
import { resolveHomeItems } from "../lib/watch/home-catalog";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function video(index: number): WatchItem {
  const id = `archive${String(index).padStart(5, "0")}`;
  return { id: `yt-${id}`, kind: "youtube", platform: "youtube", title: `Video ${index}`,
    poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, backdrop: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    memberSlug: "ron", memberLabel: "Ron", accent: "#fff",
    href: `/theater?kind=youtube&id=${id}`, sourceUrl: `https://youtube.com/watch?v=${id}`,
    publishedAt: "2020-01-01T00:00:00.000Z", durationSeconds: 3600, embeddable: true };
}

function catalog(items: WatchItem[], live: WatchItem[] = []): WatchCatalog {
  return { all: [...live, ...items], live, billboard: live[0] ?? items[0] ?? null, house: [], byMember: [],
    videos: items, shorts: [], broadcasts: [], clips: [], photos: [], recent: [],
    byPlatform: { youtube: items, twitch: live, tiktok: [], instagram: [], x: [], house: [] },
    liveCapabilities: { twitch: "supported", x: "unsupported", tiktok: "unsupported", instagram: "unsupported" },
    fetchedAt: "2026-09-10T00:00:00.000Z" };
}

test("shared Watch controls stay bounded with a 20,000 item archive and preserve live DVR metadata", (t) => {
  const live: WatchItem = { ...video(0), id: "live-ron", platform: "twitch", kind: "live",
    href: "/watch/live/StableRonaldo", live: { login: "StableRonaldo", streamId: "current-stream" },
    dvr: { enabled: true, twitchVodId: "2841234567", windowSeconds: 5000 } };
  const snapshot = watchChromeSnapshot(catalog(Array.from({ length: 20_000 }, (_, index) => video(index)), [live]));
  assert.equal(snapshot.recommendations.length, WATCH_CHROME_RECOMMENDATION_LIMIT);
  assert.equal(snapshot.recommendations[0]?.kind, "live");
  assert.deepEqual(snapshot.live, [{ id: "live-ron", platform: "twitch", memberSlug: "ron", login: "stableronaldo", dvrVodId: "2841234567" }]);
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));
  assert.ok(bytes < 100_000);
  t.diagnostic(`20,000 archive items produce a ${bytes}-byte WatchChrome snapshot`);
  assert.equal("all" in snapshot, false);
});

test("live status is never truncated when recommendation slots are filled", () => {
  const live = Array.from({ length: WATCH_CHROME_RECOMMENDATION_LIMIT + 10 }, (_, index): WatchItem => ({
    ...video(index), id: `live-${index}`, platform: "twitch", kind: "live", href: `/watch/live/channel${index}`,
    live: { login: `channel${index}` },
  }));
  const snapshot = watchChromeSnapshot(catalog([], live));
  assert.equal(snapshot.live.length, live.length);
  assert.equal(snapshot.recommendations.length, WATCH_CHROME_RECOMMENDATION_LIMIT);
});

test("DVR resolves old saved and queue-only references without transferring unsaved watch history", () => {
  const archive = catalog(Array.from({ length: 20_000 }, (_, index) => video(index)));
  const saved = archive.all[19_999]!;
  const queued = archive.all[18_000]!;
  const watchedButUnsaved = archive.all[17_000]!;
  const refs = dvrItemReferences([saved.id, "missing-title"], [{ itemIds: [queued.id, saved.id, null, ""] }]);
  assert.deepEqual(refs, [saved.id, "missing-title", queued.id]);
  const items = resolveHomeItems(archive, refs);
  assert.equal(items.length, 2);
  assert.ok(items.includes(saved));
  assert.ok(items.includes(queued));
  assert.equal(items.includes(watchedButUnsaved), false);
  assert.ok(Buffer.byteLength(JSON.stringify(items)) < 3000);
  const otherAccount = resolveHomeItems(archive, dvrItemReferences([archive.all[3]!.id], []));
  assert.equal(otherAccount.length, 1);
  assert.equal(otherAccount[0], archive.all[3]);
});

test("custom list metadata requests retain every valid reference across multiple API batches", () => {
  const queues = Array.from({ length: 20 }, (_, queue) => ({ itemIds: Array.from({ length: 120 }, (_, item) => `item-${queue}-${item}`) }));
  const refs = dvrItemReferences(["saved"], [...queues, null, {}, { itemIds: ["x".repeat(201), 12] }]);
  assert.equal(refs.length, 2401);
  assert.equal(refs.at(-1), "item-19-119");
});
