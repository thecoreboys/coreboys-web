import assert from "node:assert/strict";
import test from "node:test";
import { compactWatchCatalog, expandWatchCatalog } from "../lib/watch/catalog-cache";
import { buildMultiviewLiveRoom, restrictCatalogForLiveRoom } from "../lib/watch/multiview-access";
import { MULTIVIEW_CATALOG_ITEM_LIMIT, multiviewRequestedReferences, permittedMultiviewSearchItems, projectMultiviewCatalog } from "../lib/watch/multiview-catalog";
import { catalogPlayables, itemToPlayable } from "../lib/watch/playable";
import { encodeWorkspace, normalizeWorkspace } from "../lib/watch/workspace";
import type { WatchCatalog, WatchItem, WatchPlatform } from "../lib/watch/types";

const platforms: WatchPlatform[] = ["youtube", "twitch", "instagram", "tiktok", "x", "house"];
function fixture(count = 20_000): WatchCatalog {
  const all: WatchItem[] = Array.from({ length: count }, (_, index) => {
    const platform = platforms[index % platforms.length]!;
    const slug = `creator-${Math.floor(index / platforms.length) % 7}`;
    return {
      id: `item-${index}`, platform, kind: platform === "twitch" ? "vod" : "youtube",
      title: `Archived program ${index}`, subtitle: "Recorded program details. ".repeat(12),
      poster: `https://images.example.com/poster-${index}.jpg`, backdrop: `https://images.example.com/poster-${index}.jpg`,
      memberSlug: slug, memberLabel: slug, accountLabel: `${slug} ${platform}`, accent: "#ffffff",
      href: `/theater?kind=${platform}&id=video_${index}`, format: "long",
      mediaUrl: `https://media.example.com/${index}.mp4`,
      publishedAt: new Date(Date.UTC(2026, 8, 10) - index * 60_000).toISOString(), durationSeconds: 600,
    };
  });
  return {
    all, billboard: all[0]!, live: [], house: all.filter((item) => item.platform === "house"),
    byMember: Array.from({ length: 7 }, (_, index) => ({ slug: `creator-${index}`, label: `Creator ${index}`,
      accent: "#fff", portrait: "/poster.jpg", comm: "Community", items: all.filter((item) => item.memberSlug === `creator-${index}`) })),
    videos: all.filter((item) => item.kind !== "vod"), shorts: [], broadcasts: all.filter((item) => item.kind === "vod"),
    clips: [], photos: [], recent: all.slice(0, 64),
    byPlatform: Object.fromEntries(platforms.map((platform) => [platform, all.filter((item) => item.platform === platform)])) as WatchCatalog["byPlatform"],
    liveCapabilities: { twitch: "supported", x: "supported", tiktok: "unsupported", instagram: "unsupported" },
    fetchedAt: "2026-09-10T12:00:00.000Z", heroFeatured: [], programmingSections: [],
  };
}

test("20,000 archive records become at most 240 balanced initial sources under 500 KB", () => {
  const archive = fixture();
  // Numerous automatic rails must not undo the source limit.
  archive.programmingSections = Array.from({ length: 100 }, (_, index) => ({
    id: `section-${index}`, title: `Section ${index}`, layout: "standard", items: archive.all.slice(index * 200, (index + 1) * 200),
  }));
  const preview = projectMultiviewCatalog(archive);
  assert.equal(archive.all.length, 20_000);
  assert.equal(preview.all.length, MULTIVIEW_CATALOG_ITEM_LIMIT);
  for (const member of preview.byMember) assert.ok(member.items.length >= 30, member.slug);
  for (const platform of platforms) assert.ok(preview.byPlatform[platform].length >= 35, platform);
  const payload = compactWatchCatalog(preview);
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(bytes < 500_000, `${bytes} bytes`);
  assert.ok(bytes < Buffer.byteLength(JSON.stringify(archive)) / 50);
  assert.deepEqual(expandWatchCatalog(JSON.parse(JSON.stringify(payload))), JSON.parse(JSON.stringify(preview)));
});

test("old add links and shared room sources keep current transports and playback metadata", () => {
  const archive = fixture();
  const add = archive.all[19_998]!;
  const shared = archive.all[19_999]!;
  shared.captions = [{ src: "https://media.example.com/captions.vtt", label: "English", language: "en" }];
  shared.dvr = { enabled: true, twitchVodId: "current-vod", windowSeconds: 3600 };
  const snapshot = normalizeWorkspace({ version: 3, tiles: [{ id: "saved-tile", item: { ...itemToPlayable(shared)!, mediaUrl: "https://media.example.com/expired.mp4" } }] });
  assert.ok(snapshot);
  const references = multiviewRequestedReferences({ add: add.id, layout: encodeWorkspace(snapshot) });
  assert.deepEqual(references, [add.id, shared.id]);
  const preview = projectMultiviewCatalog(archive, references);
  assert.equal(preview.all.length, MULTIVIEW_CATALOG_ITEM_LIMIT);
  const fresh = catalogPlayables(expandWatchCatalog(JSON.parse(JSON.stringify(compactWatchCatalog(preview)))));
  assert.ok(fresh.some((item) => item.key === add.id));
  const source = fresh.find((item) => item.key === shared.id)!;
  assert.equal(source.mediaUrl, shared.mediaUrl);
  assert.deepEqual(source.captions, shared.captions);
  assert.deepEqual(source.dvr, shared.dvr);
  assert.deepEqual(multiviewRequestedReferences({ layout: "invalid", add: "x".repeat(201) }), []);
});

test("live sources survive the suggestion limit while locked all-live transports stay redacted", () => {
  const archive = fixture();
  const live: WatchItem[] = Array.from({ length: 4 }, (_, index) => ({
    ...archive.all[19_990 + index]!, id: `live-source-${index}`, kind: "live", platform: "twitch",
    live: { login: `creator${index}`, streamId: `stream-${index}` },
    dvr: { enabled: true, twitchVodId: `vod-${index}`, windowSeconds: 3600 },
  }));
  archive.all.push(...live);
  archive.live = live;
  archive.heroFeatured = live;
  archive.programmingSections = [{ id: "live", title: "Live", layout: "standard", items: live }];
  const preview = projectMultiviewCatalog(archive);
  assert.deepEqual(preview.live, live);
  assert.ok(live.every((item) => preview.all.includes(item)));
  const room = buildMultiviewLiveRoom(live, false);
  const restricted = projectMultiviewCatalog(restrictCatalogForLiveRoom(archive, room), [live[3]!.id]);
  assert.deepEqual(restricted.live, live.slice(0, 2));
  const json = JSON.stringify(compactWatchCatalog(restricted));
  for (const item of live.slice(2)) assert.equal(json.includes(item.id), false);
  const oldVideo = archive.all[19_998]!;
  assert.deepEqual(permittedMultiviewSearchItems([...live, oldVideo], room), [...live.slice(0, 2), oldVideo]);
  assert.deepEqual(permittedMultiviewSearchItems([oldVideo]), [oldVideo]);
});
