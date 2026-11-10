import assert from "node:assert/strict";
import test from "node:test";
import { mergeFreshWatchCatalog } from "../lib/watch/catalog-freshness";
import { reconcileCatalogLive } from "../lib/watch/catalog-live-status";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function item(id: string, kind: WatchItem["kind"] = "youtube"): WatchItem {
  return { id, platform: kind === "live" ? "twitch" : "youtube", kind, format: kind === "live" ? "live" : "long",
    title: id, memberSlug: "lacy", memberLabel: "Lacy", accent: "#fff", poster: `/poster-${id}.jpg`, backdrop: `/poster-${id}.jpg`, href: `/watch/${id}` };
}
function catalog(items: WatchItem[]): WatchCatalog {
  return { all: items, billboard: items[0] ?? null, live: items.filter((item) => item.kind === "live"), house: [],
    videos: items.filter((item) => item.kind === "youtube"), shorts: [], broadcasts: [], clips: [], photos: [], recent: items,
    byPlatform: { youtube: items.filter((item) => item.platform === "youtube"), twitch: items.filter((item) => item.platform === "twitch"), instagram: [], tiktok: [], x: [], house: [] },
    byMember: [{ slug: "lacy", label: "Lacy", accent: "#fff", portrait: "/lacy.jpg", comm: "Thugs", items }],
    liveCapabilities: { twitch: "supported", x: "supported", tiktok: "unsupported", instagram: "unsupported" }, fetchedAt: "2026-11-09T12:00:00Z" };
}

test("an old cached archive cannot keep an ended stream live", () => {
  const oldLive = item("live-lacy", "live");
  const older = item("old-video");
  const archive = catalog([oldLive, older]);
  archive.heroFeatured = [oldLive];
  archive.programmingSections = [{ id: "hero", title: "Featured", layout: "standard", items: [oldLive] }];
  const freshLive = item("live-adapt", "live");
  freshLive.memberSlug = "adapt";
  const recent = catalog([freshLive, item("new-upload")]);
  const merged = mergeFreshWatchCatalog(archive, recent);
  for (const list of [merged.all, merged.live, merged.byPlatform.twitch, merged.byMember[0]!.items, merged.heroFeatured!, merged.programmingSections![0]!.items]) {
    assert.ok(list.every((item) => item.id !== oldLive.id));
  }
  assert.deepEqual(merged.live, [freshLive]);
  assert.ok(merged.all.includes(older));
  assert.ok(merged.videos.some((item) => item.id === "new-upload"));
  assert.equal(archive.live[0], oldLive);
});

test("ended YouTube broadcasts remain playable without live badges in every catalog view", () => {
  const ended: WatchItem = { ...item("yt-ended", "live"), platform: "youtube", href: "/theater?kind=live&src=youtube&id=ended&format=live" };
  const active: WatchItem = { ...item("yt-active", "live"), platform: "youtube" };
  const archive = catalog([ended, active]);
  archive.heroFeatured = [ended];
  const reconciled = reconcileCatalogLive(archive, [active]);
  for (const list of [reconciled.all, reconciled.byMember[0]!.items, reconciled.byPlatform.youtube, reconciled.heroFeatured!]) {
    const video = list.find((entry) => entry.id === ended.id)!;
    assert.equal(video.kind, "vod");
    assert.equal(video.format, "long");
    assert.match(video.href, /kind=youtube/);
    assert.doesNotMatch(video.href, /format=live/);
  }
  assert.deepEqual(reconciled.live.map((entry) => entry.id), [active.id]);
  assert.equal(reconciled.all.find((entry) => entry.id === active.id)?.kind, "live");
  assert.equal(ended.kind, "live");
});

test("recent metadata replaces signed artwork and DVR capability without duplicating archive items", () => {
  const old = item("video");
  const updated = { ...old, poster: "https://cdn.example.com/new-signed-cover", dvr: { enabled: true as const, twitchVodId: "growing-vod" } };
  const merged = mergeFreshWatchCatalog(catalog([old, item("older")]), catalog([updated]));
  assert.equal(merged.all.filter((item) => item.id === old.id).length, 1);
  assert.equal(merged.videos[0], updated);
  assert.equal(merged.byMember[0]!.items[0], updated);
  assert.equal(merged.billboard, updated);
});

test("an archived YouTube upload becoming live is excluded from ordinary video shelves", () => {
  const old = item("yt-premiere");
  const live: WatchItem = { ...old, kind: "live", format: "live" };
  const merged = mergeFreshWatchCatalog(catalog([old]), catalog([live]));
  assert.deepEqual(merged.videos, []);
  assert.deepEqual(merged.live, [live]);
  assert.equal(merged.all.length, 1);
});
