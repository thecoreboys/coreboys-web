import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the explicit suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { channelProgramElapsedSeconds, networkChannelSchedule } from "../lib/watch/channel-schedule.ts";
import type { WatchItem } from "../lib/watch/types";

function video(id: string, durationSeconds: number): WatchItem {
  return {
    id,
    platform: "youtube",
    kind: "youtube",
    format: "long",
    title: id,
    poster: "/poster.jpg",
    backdrop: "/backdrop.jpg",
    memberSlug: "lacy",
    memberLabel: "Lacy",
    accent: "#f43f5e",
    href: `/theater?kind=youtube&id=${id}`,
    durationSeconds,
    embeddable: true,
  };
}

test("24/7 schedule advances at the exact duration boundary", () => {
  const anchor = Date.UTC(2026, 0, 1);
  const items = [video("first", 120), video("second", 180)];

  const before = networkChannelSchedule(items, anchor + 119_999, "continuous", 2);
  const boundary = networkChannelSchedule(items, anchor + 120_000, "continuous", 2);

  assert.equal(before[0]?.item.id, "first");
  assert.equal(channelProgramElapsedSeconds(before[0]!, anchor + 119_999), 119);
  assert.equal(boundary[0]?.item.id, "second");
  assert.equal(boundary[0]?.startsAt, anchor + 120_000);
  assert.equal(channelProgramElapsedSeconds(boundary[0]!, anchor + 120_000), 0);
});

test("24/7 schedule is stable between UI clock ticks", () => {
  const anchor = Date.UTC(2026, 0, 1);
  const items = [video("first", 120), video("second", 180)];
  const first = networkChannelSchedule(items, anchor + 130_123, "continuous", 2);
  const later = networkChannelSchedule(items, anchor + 160_987, "continuous", 2);

  assert.equal(first[0]?.item.id, "second");
  assert.equal(later[0]?.item.id, "second");
  assert.equal(first[0]?.startsAt, anchor + 120_000);
  assert.equal(later[0]?.startsAt, anchor + 120_000);
});

test("a current live item preempts the rotation without a seek offset", () => {
  const now = Date.parse("2026-08-21T15:00:00.000Z");
  const live: WatchItem = {
    ...video("live", 7_200),
    platform: "twitch",
    kind: "live",
    format: "live",
    live: { login: "lacy", startedAt: "2026-08-21T14:45:00.000Z" },
  };
  const schedule = networkChannelSchedule([video("first", 120), live], now, "continuous", 2);

  assert.equal(schedule[0]?.item.id, "live");
  assert.equal(schedule[0]?.startsAt, Date.parse(live.live!.startedAt!));
  assert.equal(channelProgramElapsedSeconds(schedule[0]!, now), 0);
});

test("a live forecast keeps the next 24/7 program stable between UI ticks", () => {
  const now = Date.parse("2026-08-21T15:00:01.000Z");
  const live: WatchItem = {
    ...video("live", 30 * 60),
    platform: "twitch",
    kind: "live",
    format: "live",
    live: { login: "lacy", startedAt: "2026-08-21T12:00:00.000Z" },
  };
  const items = [live, video("next", 22 * 60)];
  const first = networkChannelSchedule(items, now, "continuous", 2);
  const later = networkChannelSchedule(items, Date.parse("2026-08-21T15:14:59.000Z"), "continuous", 2);

  assert.equal(first[0]?.endsAt, Date.parse("2026-08-21T15:30:00.000Z"));
  assert.equal(later[0]?.endsAt, first[0]?.endsAt);
  assert.equal(later[1]?.startsAt, first[1]?.startsAt);
  assert.equal(later[1]?.item.id, "next");
});

test("a live forecast only advances the 24/7 handoff at its next fixed boundary", () => {
  const live: WatchItem = {
    ...video("live", 30 * 60),
    platform: "twitch",
    kind: "live",
    format: "live",
    live: { login: "lacy", startedAt: "2026-08-21T12:00:00.000Z" },
  };
  const items = [live, video("next", 22 * 60)];
  const before = networkChannelSchedule(items, Date.parse("2026-08-21T15:29:59.000Z"), "continuous", 2);
  const after = networkChannelSchedule(items, Date.parse("2026-08-21T15:30:00.000Z"), "continuous", 2);

  assert.equal(before[0]?.endsAt, Date.parse("2026-08-21T15:30:00.000Z"));
  assert.equal(after[0]?.endsAt, Date.parse("2026-08-21T16:00:00.000Z"));
  assert.equal(after[1]?.startsAt, Date.parse("2026-08-21T16:00:00.000Z"));
});
