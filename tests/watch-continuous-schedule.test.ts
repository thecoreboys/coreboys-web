import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping runner accepts explicit TypeScript suffixes.
import { CONTINUOUS_GUIDE_FUTURE_HORIZON_MS, buildContinuousGuideSchedule } from "../lib/watch/continuous-schedule.ts";
import type { GuideNetworkGroup, GuideNetworkRow } from "../lib/watch/channels";
import type { WatchItem } from "../lib/watch/types";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-08-20T12:00:00.000Z");

function item(id: string, publishedAt: string, durationSeconds: number, live = false): WatchItem {
  return {
    id,
    platform: live ? "twitch" : "youtube",
    kind: live ? "live" : "youtube",
    format: live ? "live" : "long",
    title: id,
    poster: `/${id}.jpg`,
    backdrop: `/${id}.jpg`,
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#ef4444",
    href: `/theater?id=${id}`,
    publishedAt,
    live: live ? { startedAt: publishedAt } : undefined,
    durationSeconds,
  };
}

function fixture(items: WatchItem[]): { group: GuideNetworkGroup; row: GuideNetworkRow } {
  const row: GuideNetworkRow = {
    id: "adapt-continuous",
    networkSlug: "adapt",
    kind: "continuous",
    label: "24/7",
    description: "Always on",
    timelineSlug: "adapt",
    channel: { id: "adapt-247", title: "Flock 24/7", subtitle: "Always on", href: "/", artwork: "/flock.png" },
    items,
  };
  return {
    row,
    group: {
      network: {
        slug: "adapt",
        name: "Flock",
        community: "Flock",
        host: "Adapt",
        memberSlug: "adapt",
        description: "Flock network",
        artwork: "/flock.png",
        backdrop: "/flock-background.png",
        accent: "#ef4444",
      },
      rows: [row],
    },
  };
}

test("uses real durations and never airs an item before publication", () => {
  const first = item("first", "2026-08-18T00:00:00.000Z", 45 * 60);
  const fresh = item("fresh", "2026-08-18T01:10:00.000Z", 20 * 60);
  const { group, row } = fixture([first, fresh]);
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: Date.parse("2026-08-18T00:00:00.000Z"),
    rangeEnd: Date.parse("2026-08-18T04:00:00.000Z"),
    nowMs: NOW,
  });

  assert.ok(blocks.length > 2);
  assert.equal(blocks[0]?.endMs! - blocks[0]?.startMs!, 45 * 60 * 1000);
  const freshBlocks = blocks.filter((block) => block.item.id === "fresh");
  assert.ok(freshBlocks.length > 0);
  assert.ok(freshBlocks.every((block) => block.startMs >= Date.parse(fresh.publishedAt!)));
});

test("keeps a provider duration longer than six hours intact in the rotation", () => {
  const marathon = item("marathon", "2026-08-18T00:00:00.000Z", 8 * 60 * 60);
  const { group, row } = fixture([marathon]);
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: Date.parse("2026-08-18T00:00:00.000Z"),
    rangeEnd: Date.parse("2026-08-18T10:00:00.000Z"),
    nowMs: NOW,
  });

  assert.equal(blocks[0]?.endMs! - blocks[0]?.startMs!, 8 * 60 * 60 * 1_000);
});

test("returns a contiguous, multi-program future queue for the 24/7 guide", () => {
  const { group, row } = fixture([
    item("first", "2026-08-20T00:00:00.000Z", 20 * 60),
    item("second", "2026-08-20T00:00:00.000Z", 25 * 60),
    item("third", "2026-08-20T00:00:00.000Z", 30 * 60),
  ]);
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: NOW - 60 * 60 * 1_000,
    rangeEnd: NOW + 8 * HOUR,
    nowMs: NOW,
  });
  const queue = blocks.filter((block) => block.endMs > NOW);

  assert.ok(queue.length >= 4);
  assert.ok(queue.some((block) => block.current));
  assert.ok(queue.filter((block) => block.startMs >= NOW).length >= 3);
  assert.ok(queue.every((block, index) => index === 0 || queue[index - 1]!.endMs === block.startMs));
});

test("adding a newly published video does not rewrite the earlier schedule", () => {
  const original = [
    item("one", "2026-08-17T00:00:00.000Z", 30 * 60),
    item("two", "2026-08-17T01:00:00.000Z", 40 * 60),
  ];
  const beforeFixture = fixture(original);
  const afterFixture = fixture([
    ...original,
    item("new", "2026-08-18T12:15:00.000Z", 25 * 60),
  ]);
  const rangeStart = Date.parse("2026-08-17T00:00:00.000Z");
  const rangeEnd = Date.parse("2026-08-19T00:00:00.000Z");
  const cutoff = Date.parse("2026-08-18T12:15:00.000Z");
  const before = buildContinuousGuideSchedule({ ...beforeFixture, rangeStart, rangeEnd, nowMs: NOW });
  const after = buildContinuousGuideSchedule({ ...afterFixture, rangeStart, rangeEnd, nowMs: NOW });

  const signature = (blocks: typeof before) => blocks
    .filter((block) => block.startMs < cutoff)
    .map((block) => [block.item.id, block.startMs, block.endMs]);
  assert.deepEqual(signature(after), signature(before));
  assert.ok(after.some((block) => block.item.id === "new" && block.startMs >= cutoff));
});

test("an active live stream interrupts the rotation at its actual start", () => {
  const video = item("video", "2026-08-19T00:00:00.000Z", 2 * 60 * 60);
  const live = item("live-now", "2026-08-20T11:20:00.000Z", 30 * 60, true);
  const { group, row } = fixture([video]);
  group.rows.push({ ...row, id: "adapt-live", kind: "live", label: "Live", items: [live] });
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: NOW - 2 * HOUR,
    rangeEnd: NOW + 2 * HOUR,
    nowMs: NOW,
  });
  const liveBlock = blocks.find((block) => block.source === "live");

  assert.ok(liveBlock);
  assert.equal(liveBlock.startMs, Date.parse("2026-08-20T11:20:00.000Z"));
  assert.ok(liveBlock.current);
  assert.ok(blocks.every((block) => block === liveBlock || block.endMs <= liveBlock.startMs || block.startMs >= liveBlock.endMs));
});

test("a live stream defers the interrupted program and the following rotation", () => {
  const video = item("video", "2026-08-20T08:00:00.000Z", 2 * 60 * 60);
  const live = item("live-now", "2026-08-20T11:20:00.000Z", 60 * 60, true);
  const { group, row } = fixture([video]);
  group.rows.push({ ...row, id: "adapt-live", kind: "live", label: "Live", items: [live] });
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: Date.parse("2026-08-20T10:00:00.000Z"),
    rangeEnd: Date.parse("2026-08-20T16:00:00.000Z"),
    nowMs: NOW,
  });
  const liveBlock = blocks.find((block) => block.source === "live");

  assert.ok(liveBlock);
  assert.equal(liveBlock.startMs, Date.parse("2026-08-20T11:20:00.000Z"));
  assert.equal(liveBlock.endMs, Date.parse("2026-08-20T12:20:00.000Z"));

  const resumed = blocks.find((block) => (
    block.source === "rotation"
    && block.item.id === "video"
    && block.startMs === liveBlock.endMs
  ));
  assert.ok(resumed, "the unfinished portion should resume immediately after live");
  assert.equal(resumed.endMs, Date.parse("2026-08-20T13:00:00.000Z"));

  const following = blocks.find((block) => (
    block.source === "rotation"
    && block.item.id === "video"
    && block.startMs === resumed.endMs
  ));
  assert.ok(following, "the next full rotation item should follow the resumed remainder");
  assert.equal(following.endMs - following.startMs, 2 * 60 * 60 * 1_000);
  assert.ok(blocks.every((block, index) => index === 0 || blocks[index - 1]!.endMs <= block.startMs));
});

test("an ended live stream resumes the interrupted 24/7 program from its remaining time", () => {
  const video = item("video", "2026-08-20T08:00:00.000Z", 2 * 60 * 60);
  const live = item("live-ended", "2026-08-20T11:20:00.000Z", 60 * 60, true);
  const { group, row } = fixture([video]);
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: Date.parse("2026-08-20T10:00:00.000Z"),
    rangeEnd: Date.parse("2026-08-20T16:00:00.000Z"),
    nowMs: Date.parse("2026-08-20T12:30:00.000Z"),
    completedLiveInterruptions: [{
      item: live,
      startsAtMs: Date.parse("2026-08-20T11:20:00.000Z"),
      endsAtMs: Date.parse("2026-08-20T12:20:00.000Z"),
    }],
  });

  const resumed = blocks.find((block) => (
    block.source === "rotation"
    && block.item.id === "video"
    && block.startMs === Date.parse("2026-08-20T12:20:00.000Z")
  ));
  assert.ok(resumed, "the pause should survive after the provider removes the live card");
  assert.equal(resumed.endMs, Date.parse("2026-08-20T13:00:00.000Z"));
  assert.ok(resumed.current);
});

test("live forecast boundaries do not move while the guide clock advances", () => {
  const video = item("video", "2026-08-19T00:00:00.000Z", 2 * 60 * 60);
  const live = item("live-now", "2026-08-20T11:20:00.000Z", 30 * 60, true);
  const { group, row } = fixture([video]);
  group.rows.push({ ...row, id: "adapt-live", kind: "live", label: "Live", items: [live] });
  const firstNow = Date.parse("2026-08-20T12:07:00.000Z");
  const laterNow = firstNow + 12_000;
  const input = {
    group,
    row,
    rangeStart: firstNow - HOUR,
    rangeEnd: firstNow + 2 * HOUR,
  };
  const first = buildContinuousGuideSchedule({ ...input, nowMs: firstNow });
  const later = buildContinuousGuideSchedule({ ...input, nowMs: laterNow });
  const firstLive = first.find((block) => block.source === "live");
  const laterLive = later.find((block) => block.source === "live");

  assert.equal(firstLive?.endMs, Date.parse("2026-08-20T12:30:00.000Z"));
  assert.equal(laterLive?.endMs, firstLive?.endMs);
});

test("caps all future planning at eighteen hours", () => {
  const content = item("long", "2026-08-01T00:00:00.000Z", 6 * 60 * 60);
  const { group, row } = fixture([content]);
  const blocks = buildContinuousGuideSchedule({
    group,
    row,
    rangeStart: NOW,
    rangeEnd: NOW + 7 * 24 * HOUR,
    nowMs: NOW,
  });
  const limit = NOW + CONTINUOUS_GUIDE_FUTURE_HORIZON_MS;

  assert.ok(blocks.length > 0);
  assert.ok(blocks.every((block) => block.startMs < limit && block.endMs <= limit));
  assert.equal(Math.max(...blocks.map((block) => block.endMs)), limit);
});

test("can query a narrow window years in the past deterministically", () => {
  const { group, row } = fixture([
    item("archive-a", "2020-01-01T00:00:00.000Z", 35 * 60),
    item("archive-b", "2020-01-02T00:00:00.000Z", 55 * 60),
  ]);
  const input = {
    group,
    row,
    rangeStart: Date.parse("2024-06-01T00:00:00.000Z"),
    rangeEnd: Date.parse("2024-06-01T06:00:00.000Z"),
    nowMs: NOW,
  };
  const first = buildContinuousGuideSchedule(input);
  const second = buildContinuousGuideSchedule(input);

  assert.ok(first.length > 0);
  assert.deepEqual(second, first);
});
