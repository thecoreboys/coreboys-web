import assert from "node:assert/strict";
import test from "node:test";
import {
  compactWatchCatalog,
  expandWatchCatalog,
  isCompactWatchCatalog,
  type CompactWatchCatalog,
} from "../lib/watch/catalog-cache";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function item(index: number): WatchItem {
  return {
    id: `yt-archive-${index}`, kind: "youtube", platform: "youtube",
    title: `Archive broadcast ${index}`, subtitle: "Creator · Channel uploads",
    poster: `https://i.ytimg.com/vi/archive-${index}/hqdefault.jpg`,
    backdrop: `https://i.ytimg.com/vi/archive-${index}/maxresdefault.jpg`,
    memberSlug: "ron", memberLabel: "StableRonaldo", accountLabel: "StableRonaldo VODs",
    accent: "#ffffff", href: `/theater?kind=youtube&id=archive-${index}&slug=ron`,
    sourceUrl: `https://www.youtube.com/watch?v=archive-${index}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/archive-${index}`,
    publishedAt: "2026-09-01T00:00:00.000Z", durationSeconds: 3600,
    format: "long", orientation: "landscape", previewStrategy: "animated", embeddable: true,
    focalPoint: { x: 0.5, y: 0.5 }, liveCapability: "supported",
  };
}

function catalog(items: WatchItem[]): WatchCatalog {
  return {
    all: items, billboard: items[0] ?? null, live: [], house: [],
    byMember: [{ slug: "ron", label: "StableRonaldo", accent: "#fff", portrait: "/ron.jpg", comm: "Ron", items }],
    videos: items, shorts: [], broadcasts: [], clips: [], photos: [], recent: items.slice(0, 64),
    byPlatform: { youtube: items, twitch: [], tiktok: [], instagram: [], x: [], house: [] },
    liveCapabilities: { twitch: "supported", x: "not_configured", tiktok: "unsupported", instagram: "unsupported" },
    fetchedAt: "2026-09-10T00:00:00.000Z",
  };
}

test("catalog cache survives JSON storage with shared references and every shelf override", () => {
  const original = catalog([item(1), item(2)]);
  const override = { ...original.all[0]!, title: "Editorial title", programming: {
    community: true as const, sourceId: "curated", routes: [{ networkSlug: "core" as const, channelMode: "videos" as const }],
  } };
  original.house = [{ ...original.all[0]! }];
  original.heroFeatured = [override];
  original.programmingSections = [{ id: "editorial", title: "Editorial", layout: "standard", items: [override, original.all[1]!] }];
  const stored = JSON.parse(JSON.stringify(compactWatchCatalog(original))) as CompactWatchCatalog;
  assert.equal(stored.items.length, 3, "identical cloned objects intern; different same-id metadata stays distinct");
  assert.equal(isCompactWatchCatalog(stored), true);
  const restored = expandWatchCatalog(stored);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(original)));
  assert.equal(restored.all[0], restored.byPlatform.youtube[0]);
  assert.equal(restored.all[0], restored.house[0]);
  assert.equal(restored.all[0], restored.billboard);
  assert.notEqual(restored.all[0], restored.heroFeatured?.[0]);
  assert.equal(restored.heroFeatured?.[0], restored.programmingSections?.[0]?.items[0]);
  assert.equal(expandWatchCatalog(stored), restored, "process memory hits reuse the reconstructed catalog");
});

test("20,000 archive entries store once instead of once per collection", (t) => {
  const original = catalog(Array.from({ length: 20_000 }, (_, index) => item(index)));
  const expandedBytes = Buffer.byteLength(JSON.stringify(original));
  const serialized = JSON.stringify(compactWatchCatalog(original));
  const compactBytes = Buffer.byteLength(serialized);
  t.diagnostic(`20,000 items: expanded ${expandedBytes} bytes; compact ${compactBytes} bytes`);
  assert.ok(compactBytes < expandedBytes * 0.3, "index lists avoid repeated archive objects");
  const stored = JSON.parse(serialized) as CompactWatchCatalog;
  assert.equal(isCompactWatchCatalog(stored), true);
  assert.equal(stored.items.length, 20_000);
  const restored = expandWatchCatalog(stored);
  assert.equal(restored.all.length, 20_000);
  assert.equal(restored.all[19_999]?.sourceUrl, original.all[19_999]?.sourceUrl);
  for (let index = 0; index < restored.all.length; index++) {
    assert.equal(restored.all[index], restored.byMember[0]?.items[index]);
    assert.equal(restored.all[index], restored.videos[index]);
    assert.equal(restored.all[index], restored.byPlatform.youtube[index]);
  }
});

test("malformed compact cache indices and versions are rejected before expansion", () => {
  const valid = compactWatchCatalog(catalog([item(1)]));
  for (const invalid of [
    { ...valid, version: 0 }, { ...valid, all: [-1] }, { ...valid, all: [1] },
    { ...valid, live: [0.5] }, { ...valid, billboard: 1 },
    { ...valid, byMember: [{ slug: "ron", label: "Ron", items: [99] }] },
    { ...valid, byPlatform: { ...valid.byPlatform, x: [99] } },
    { ...valid, heroFeatured: [99] },
    { ...valid, programmingSections: [{ id: "x", title: "X", items: [99] }] },
  ]) assert.equal(isCompactWatchCatalog(invalid), false);
  assert.equal(isCompactWatchCatalog(compactWatchCatalog(catalog([]))), true);
});
