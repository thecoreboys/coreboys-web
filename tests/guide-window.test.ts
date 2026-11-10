import assert from "node:assert/strict";
import test from "node:test";
import { buildGuideNetworkRows } from "../lib/watch/channels";
import { buildContinuousGuideSchedule } from "../lib/watch/continuous-schedule";
import { guideProgramFromItem, GUIDE_MAX_WINDOW_MS, projectGuideWindow } from "../lib/watch/guide-window";
import { packGuidePayload, unpackGuidePayload } from "../lib/watch/guide-transport";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const now = Date.parse("2026-11-09T12:00:00Z");
const items: WatchItem[] = Array.from({ length: 500 }, (_, index) => ({
  id: `yt-${index}`, kind: "youtube", platform: "youtube", title: `Episode ${index}`,
  poster: `https://example.com/${index}.jpg`, backdrop: `https://example.com/${index}.jpg`,
  memberSlug: null, memberLabel: "CORE", accent: "#fff", href: `/theater?kind=youtube&id=video${index}`,
  publishedAt: new Date(now - (501 - index) * 86_400_000).toISOString(), durationSeconds: 3600,
}));
const catalog = { all: items, live: [], house: items, videos: items, shorts: [], broadcasts: [], clips: [], byMember: [],
  programmingSections: [], heroFeatured: [], fetchedAt: new Date(now).toISOString(),
} as unknown as WatchCatalog;
const networks = buildGuideNetworkRows(catalog);
const payload = { serverNow: new Date(now).toISOString(), horizonEnd: new Date(now + 7 * 86_400_000).toISOString(),
  networks, programs: items.flatMap((item) => { const program = guideProgramFromItem(item); return program ? [program] : []; }),
};

test("a small Guide window uses the full archive's exact continuous airings", () => {
  const start = now - 2 * 3600_000, end = now + 4 * 3600_000;
  const snapshot = projectGuideWindow(payload, start, end);
  const group = networks[0]!;
  const row = group.rows.find((entry) => entry.kind === "continuous")!;
  const expected = buildContinuousGuideSchedule({ group, row, rangeStart: start, rangeEnd: end, nowMs: now });
  assert.deepEqual(snapshot.programs.filter((program) => program.guideRowId === row.id).map((program) => [program.watchItem?.id, program.startsAt, program.endsAt]),
    expected.map((entry) => [entry.item.id, entry.startsAt, entry.endsAt]));
  assert.ok(snapshot.networks![0]!.rows.flatMap((entry) => entry.items).length < 30);
  assert.equal(networks[0]!.rows.find((entry) => entry.kind === "videos")!.items.length, 500, "the source archive is never truncated or mutated");
});

test("paging to an older date retrieves that exact archive window", () => {
  const start = now - 300 * 86_400_000, end = start + 86_400_000;
  const snapshot = projectGuideWindow(payload, start, end);
  assert.ok(snapshot.programs.some((program) => !program.continuous && program.watchItem?.id === "yt-201"));
  assert.equal(snapshot.window?.earliest, Date.parse(items[0]!.publishedAt!));
});

test("Guide window metadata and signed playback fields survive compact transport", () => {
  const projected = projectGuideWindow(payload, now - 3600_000, now + 3600_000);
  assert.deepEqual(unpackGuidePayload(JSON.parse(JSON.stringify(packGuidePayload(projected)))), JSON.parse(JSON.stringify(projected)));
});

test("undated catalog items still produce continuous blocks at the shared clock", () => {
  const program = guideProgramFromItem({ ...items[0]!, publishedAt: undefined }, new Date(now).toISOString());
  assert.equal(program?.startsAt, new Date(now).toISOString());
  assert.equal(program?.watchItem?.publishedAt, undefined);
});

test("a completed broadcast with an old live format is a replay, not live", () => {
  const program = guideProgramFromItem({ ...items[0]!, kind: "vod", format: "live" });
  assert.equal(program?.status, "replay");
  assert.equal(program?.contentType, "broadcast");
  assert.ok(program?.endsAt);
});

test("invalid or unbounded date windows cannot request the complete archive", () => {
  assert.throws(() => projectGuideWindow(payload, NaN, now), /Invalid guide window/);
  assert.throws(() => projectGuideWindow(payload, now, now), /Invalid guide window/);
  assert.throws(() => projectGuideWindow(payload, now, now + GUIDE_MAX_WINDOW_MS + 1), /Invalid guide window/);
});

test("an eight-day local window remains valid across the daylight saving fallback", () => {
  assert.doesNotThrow(() => projectGuideWindow(payload, now, now + 8 * 86_400_000 + 3_600_000));
});

test("Tonight can request dated events without downloading any linear channel libraries", () => {
  const snapshot = projectGuideWindow(payload, now - 3 * 86_400_000, now + 86_400_000, false);
  assert.equal(snapshot.networks, undefined);
  assert.equal(snapshot.programs.some((program) => program.continuous), false);
  assert.ok(snapshot.programs.some((program) => program.watchItem?.id === "yt-499"));
});
