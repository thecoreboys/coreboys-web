import assert from "node:assert/strict";
import test from "node:test";
import { buildNetworkChannelHub, buildNetworkChannelLineup, NETWORK_CHANNELS } from "../lib/watch/channels";
import { channelArchivePage, channelLibraryPreview, createChannelPageSnapshot, unpackChannelPageSnapshot } from "../lib/watch/channel-page-snapshot";
import { buildContinuousGuideSchedule } from "../lib/watch/continuous-schedule";
import { buildCuratedChannelRails } from "../lib/watch/creator-platform-rails";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const now = Date.parse("2026-11-09T21:00:00Z");
const channel = NETWORK_CHANNELS.find((entry) => entry.slug === "core")!;
function fixture(count = 4_000): WatchCatalog {
  const all: WatchItem[] = Array.from({ length: count }, (_, index) => ({
    id: `tt-${index}`, platform: "tiktok", kind: "clip", format: "short", durationSeconds: 60,
    title: `Real post ${index}`, memberSlug: index % 2 ? "lacy" : "adapt", memberLabel: index % 2 ? "Lacy" : "Adapt",
    accountLabel: index % 2 ? "Lacy TikTok" : "Adapt TikTok", accent: "#fff", embeddable: true,
    poster: `https://images.example.com/${index}.jpg?signature=${"long-signed-provider-image".repeat(15)}`,
    backdrop: `https://images.example.com/${index}.jpg?signature=${"long-signed-provider-image".repeat(15)}`,
    sourceUrl: `https://www.tiktok.com/@creator/video/${index}`, href: `/theater?id=tt-${index}`,
    publishedAt: new Date(now - index * 60_000).toISOString(),
  }));
  return { all, billboard: all[0]!, live: [], house: [], videos: [], shorts: all, broadcasts: [], clips: [], photos: [], recent: all.slice(0, 64),
    byMember: [], byPlatform: { twitch: [], youtube: [], tiktok: all, instagram: [], x: [], house: [] },
    liveCapabilities: { twitch: "supported", x: "supported", tiktok: "unsupported", instagram: "unsupported" }, fetchedAt: new Date(now).toISOString() };
}

test("large channel archives transfer only shelf previews and upcoming airings without changing the source archive", () => {
  const catalog = fixture();
  const items = buildNetworkChannelLineup(catalog, channel, "continuous");
  const hub = buildNetworkChannelHub(catalog, channel);
  const snapshot = createChannelPageSnapshot({ channel, mode: "continuous", items, continuousItems: items, hub, now });
  const page = unpackChannelPageSnapshot(snapshot);
  assert.equal(catalog.all.length, 4_000);
  assert.ok(snapshot.payload.items.length <= 132);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < Buffer.byteLength(JSON.stringify(catalog.all)) / 10);
  assert.equal(page.hub.all.length, 12);
  assert.deepEqual(Object.values(page.railTotals).sort(), [2_000, 2_000]);
  const row = { id: "core:continuous", kind: "continuous" as const, items } as Parameters<typeof buildContinuousGuideSchedule>[0]["row"];
  const expected = buildContinuousGuideSchedule({ group: { network: channel, rows: [row] }, row,
    rangeStart: now - 86_400_000, rangeEnd: now + 64_800_000, nowMs: now }).filter((entry) => entry.endMs > now).slice(0, 60);
  assert.deepEqual(page.scheduleSnapshot.continuous.map((entry) => [entry.item.id, entry.startsAt, entry.endsAt]),
    expected.map((entry) => [entry.item.id, entry.startMs, entry.endMs]));
});

test("archive pagination reaches every item from its exact source without duplicates or losing metadata", () => {
  const hub = buildNetworkChannelHub(fixture(120), channel);
  const { hub: preview } = channelLibraryPreview(hub);
  for (const rail of buildCuratedChannelRails(hub.all)) {
    const initial = buildCuratedChannelRails(preview.all).find((entry) => entry.id === rail.id)!.items;
    const received = [...initial];
    let cursor: string | null = `${initial.at(-1)!.platform}:${initial.at(-1)!.id}`;
    do {
      const page: NonNullable<ReturnType<typeof channelArchivePage>> = channelArchivePage(hub, rail.id, cursor)!;
      assert.equal(page.total, rail.items.length);
      assert.ok(page.items.every((item) => item.accountLabel === rail.items[0]!.accountLabel));
      received.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(received, rail.items);
    assert.equal(new Set(received.map((item) => item.id)).size, rail.items.length);
  }
  assert.equal(channelArchivePage(hub, "unknown-source", null), null);
});

test("a selected Short opens a bounded window in its own source and paginates forward", () => {
  const hub = buildNetworkChannelHub(fixture(180), channel);
  const rails = buildCuratedChannelRails(hub.all);
  const rail = rails[0]!;
  const selected = rail.items[50]!;
  const page = channelArchivePage(hub, rail.id, null, `${selected.platform}:${selected.id}`)!;
  assert.equal(page.items[6]?.id, selected.id);
  assert.ok(page.items.every((entry) => entry.accountLabel === selected.accountLabel));
  const next = channelArchivePage(hub, rail.id, page.nextCursor)!;
  assert.equal(next.items[0]?.id, rail.items[68]?.id);
  assert.equal(channelArchivePage(hub, rail.id, null, "tiktok:missing"), null);
});

test("bounded channel snapshots preserve the exact resumed airing after a live interruption", () => {
  const catalog = fixture(200);
  const items = buildNetworkChannelLineup(catalog, channel, "continuous");
  const hub = buildNetworkChannelHub(catalog, channel);
  const live: WatchItem = { ...catalog.all[0]!, id: "live-adapt", platform: "twitch", kind: "live", format: "live" };
  const interruptions = [{ item: live, startsAtMs: now - 30 * 60_000, endsAtMs: now - 10 * 60_000 }];
  const snapshot = createChannelPageSnapshot({ channel, mode: "continuous", items, continuousItems: items, hub, now, completedLiveInterruptions: interruptions });
  const page = unpackChannelPageSnapshot(snapshot);
  const row = { id: "core:continuous", kind: "continuous" as const, items } as Parameters<typeof buildContinuousGuideSchedule>[0]["row"];
  const expected = buildContinuousGuideSchedule({ group: { network: channel, rows: [row] }, row,
    rangeStart: now - 86_400_000, rangeEnd: now + 64_800_000, nowMs: now, completedLiveInterruptions: interruptions }).filter((entry) => entry.endMs > now)[0]!;
  assert.deepEqual([page.scheduleSnapshot.continuous[0]!.item.id, page.scheduleSnapshot.continuous[0]!.startsAt], [expected.item.id, expected.startMs]);
});
