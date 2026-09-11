import assert from "node:assert/strict";
import test from "node:test";
import { compactWatchCatalog, expandWatchCatalog } from "../lib/watch/catalog-cache";
import { HOME_CATALOG_ITEM_LIMIT, homeItemReferences, mergeHomeItems, projectHomeCatalog, resolveHomeItems } from "../lib/watch/home-catalog";
import { selectContinueWatchingItems } from "../lib/watch/continue-watching";
import type { WatchCatalog, WatchItem, WatchPlatform } from "../lib/watch/types";

const platforms: WatchPlatform[] = ["youtube", "twitch", "instagram", "tiktok", "x", "house"];
function fixture(count = 20_000): WatchCatalog {
  const all: WatchItem[] = Array.from({ length: count }, (_, index) => {
    const platform = platforms[index % platforms.length]!;
    const slug = `creator-${Math.floor(index / platforms.length) % 7}`;
    return {
      id: `item-${index}`, platform, kind: platform === "twitch" ? "vod" : "youtube",
      title: `A real archived title ${index}`, subtitle: "Recorded program details. ".repeat(12),
      poster: `https://images.example.com/poster-${index}.jpg`, backdrop: `https://images.example.com/poster-${index}.jpg`,
      memberSlug: slug, memberLabel: slug, accountLabel: `${slug} ${platform}`, accent: "#ffffff",
      href: `/theater?kind=${platform}&id=video_${index}`,
      format: platform === "instagram" ? "photo" : platform === "tiktok" ? "short" : "long",
      publishedAt: new Date(Date.UTC(2026, 8, 10) - index * 60_000).toISOString(), durationSeconds: 600,
    };
  });
  return {
    all, billboard: all[0]!, live: [], house: all.filter((item) => item.platform === "house"),
    byMember: Array.from({ length: 7 }, (_, index) => ({ slug: `creator-${index}`, label: `Creator ${index}`,
      accent: "#fff", portrait: "/poster.jpg", comm: "Community", items: all.filter((item) => item.memberSlug === `creator-${index}`) })),
    videos: all.filter((item) => item.format === "long" && item.kind !== "vod"),
    shorts: all.filter((item) => item.format === "short"), broadcasts: all.filter((item) => item.kind === "vod"),
    clips: [], photos: all.filter((item) => item.format === "photo"), recent: all.slice(0, 64),
    byPlatform: Object.fromEntries(platforms.map((platform) => [platform, all.filter((item) => item.platform === platform)])) as WatchCatalog["byPlatform"],
    liveCapabilities: { twitch: "supported", x: "supported", tiktok: "unsupported", instagram: "unsupported" },
    fetchedAt: "2026-09-10T12:00:00.000Z", heroFeatured: [], programmingSections: [],
  };
}

test("a 20,000-item archive sends a balanced homepage preview under 2 MB without shrinking the archive", () => {
  const archive = fixture();
  const home = projectHomeCatalog(archive);
  assert.equal(archive.all.length, 20_000);
  assert.ok(home.all.length <= HOME_CATALOG_ITEM_LIMIT);
  for (const member of home.byMember) assert.ok(member.items.length >= 30, member.slug);
  for (const platform of platforms) assert.ok(home.byPlatform[platform].length >= 30, platform);
  for (const items of [home.house, home.videos, home.shorts, home.broadcasts, home.photos]) assert.ok(items.length >= 30);
  const payload = compactWatchCatalog(home);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 2_000_000);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < Buffer.byteLength(JSON.stringify(archive)) / 20);
  assert.deepEqual(expandWatchCatalog(JSON.parse(JSON.stringify(payload))), JSON.parse(JSON.stringify(home)));
});

test("live sessions, their DVR metadata and older curated hero selections stay in the homepage preview", () => {
  const archive = fixture(2000);
  const live: WatchItem = { ...archive.all.at(-1)!, id: "live-old-creator", kind: "live", platform: "twitch", format: "live",
    live: { login: "creator", streamId: "session" }, dvr: { enabled: true, twitchVodId: "archive", windowSeconds: 3600 } };
  const curated = { ...archive.all.at(-2)!, programming: { community: true as const, sourceId: "source", curatedItemId: "editorial", routes: [] } };
  archive.all.push(live, curated);
  archive.live = [live];
  archive.heroFeatured = [curated];
  archive.programmingSections = [{ id: "editorial", title: "Editorial", layout: "standard", items: [curated] }];
  const home = projectHomeCatalog(archive);
  assert.ok(home.all.includes(live));
  assert.ok(home.all.includes(curated));
  assert.deepEqual(home.live[0]!.dvr, live.dvr);
  assert.deepEqual(home.programmingSections?.[0]?.items, [curated]);
});

test("older saved and resume references resolve on demand and restore Continue Watching", () => {
  const archive = fixture();
  const old = archive.all[19_998]!;
  assert.equal(old.platform, "youtube");
  const home = projectHomeCatalog(archive);
  assert.ok(!home.all.some((item) => item.id === old.id));
  const providerRef = "video_19998";
  const marks = { [providerRef]: { seconds: 120, progress: 0.2, positionUpdatedAt: new Date().toISOString() } };
  assert.deepEqual(selectContinueWatchingItems(home.all, marks, homeItemReferences), []);
  for (const ref of [old.id, `${old.platform}:${old.id}`, providerRef]) {
    const resolved = resolveHomeItems(archive, [ref]);
    assert.deepEqual(resolved, [old]);
    assert.deepEqual(selectContinueWatchingItems([...home.all, ...resolved], marks, homeItemReferences), [old]);
  }
  assert.deepEqual(resolveHomeItems(archive, ["not-in-the-catalog"]), []);
  assert.deepEqual(mergeHomeItems([old], [old, { ...old }]), [old]);
});

test("many automatic programming collections cannot expand the initial homepage archive", () => {
  const archive = fixture();
  archive.programmingSections = Array.from({ length: 100 }, (_, index) => ({
    id: `section-${index}`, title: `Section ${index}`, layout: "standard",
    items: archive.all.slice(index * 100, index * 100 + 100),
  }));
  const home = projectHomeCatalog(archive);
  assert.ok(home.all.length <= HOME_CATALOG_ITEM_LIMIT);
  assert.ok(home.programmingSections!.every((section) => section.items.length > 0));
});
