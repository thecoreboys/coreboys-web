import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketAirtimeMinutesByDay,
  buildBroadcastHistoryFallback,
  computeAirtimeSummaries,
  mergeAirtimeHistorySessions,
  type AirtimeHistorySession,
} from "../lib/watch/airtime-history";
import { formatAirtime } from "../lib/watch/airtime";
import type { WatchItem } from "../lib/watch/types";

function vod(overrides: Partial<WatchItem> = {}): WatchItem {
  return {
    id: "vod-123",
    kind: "vod",
    platform: "twitch",
    title: "A real broadcast",
    poster: "https://example.com/poster.jpg",
    backdrop: "https://example.com/backdrop.jpg",
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#ef4444",
    href: "/theater?kind=vod&id=123",
    sourceUrl: "https://www.twitch.tv/videos/123",
    publishedAt: "2026-08-20T23:30:00Z",
    durationSeconds: 7_200,
    format: "long",
    twitch: { streamId: "stream-123", vodId: "123" },
    ...overrides,
  };
}

function session(overrides: Partial<AirtimeHistorySession> = {}): AirtimeHistorySession {
  return {
    id: "observed-1",
    slug: "adapt",
    startedAt: "2026-08-20T23:30:00Z",
    endedAt: "2026-08-21T01:30:00Z",
    totalMinutes: 120,
    peakViewers: 100,
    title: "Observed broadcast",
    game: null,
    twitchStreamId: "stream-123",
    source: "observed",
    ...overrides,
  };
}

test("builds real fallback sessions only from recent Twitch broadcasts", () => {
  const now = Date.parse("2026-08-21T12:00:00Z");
  const fallback = buildBroadcastHistoryFallback([
    vod(),
    vod({ id: "youtube-1", kind: "youtube", platform: "youtube" }),
    vod({ id: "old", publishedAt: "2026-06-01T00:00:00Z" }),
  ], now);

  assert.equal(fallback.length, 1);
  assert.equal(fallback[0]?.source, "twitch-vod");
  assert.equal(fallback[0]?.totalMinutes, 120);
  assert.equal(fallback[0]?.endedAt, "2026-08-21T01:30:00.000Z");
});

test("prefers an observed session over its matching Twitch VOD", () => {
  const observed = session();
  const fallback = buildBroadcastHistoryFallback([vod()], Date.parse("2026-08-21T12:00:00Z"));
  const merged = mergeAirtimeHistorySessions([observed], fallback);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, observed.id);
  assert.equal(merged[0]?.source, "observed");
});

test("splits overnight airtime across viewer-local calendar days", () => {
  const totals = bucketAirtimeMinutesByDay([
    session({
      startedAt: "2026-08-21T03:30:00Z",
      endedAt: "2026-08-21T05:30:00Z",
    }),
  ], "America/New_York");

  assert.equal(totals.get("adapt:2026-08-20"), 30);
  assert.equal(totals.get("adapt:2026-08-21"), 90);
});

test("computed summaries retain honest airtime and broadcast counts", () => {
  const summaries = computeAirtimeSummaries([
    session(),
    session({ id: "observed-2", twitchStreamId: "stream-456", startedAt: "2026-08-19T20:00:00Z", totalMinutes: 60 }),
  ], Date.parse("2026-08-21T12:00:00Z"));

  assert.deepEqual(summaries.get("adapt"), { minutesStreamed: 180, broadcasts: 2 });
  assert.equal(formatAirtime(0), "0m");
});
