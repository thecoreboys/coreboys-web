import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deriveMetricsDashboard, type MetricsDashboard } from "../lib/metrics-dashboard-model";

function dashboard(overrides: Partial<MetricsDashboard> = {}): MetricsDashboard {
  return {
    generatedAt: "2026-08-31T12:00:00.000Z",
    channels: [
      { owner: "core", kind: "core", platform: "youtube", handle: "core-yt", url: "https://youtube.com/@core", label: "@core" },
      { owner: "adapt", kind: "member", platform: "twitch", handle: "adapt", url: "https://twitch.tv/adapt", label: "@adapt" },
      { owner: "lacy", kind: "member", platform: "tiktok", handle: "lacy-tt", url: "https://tiktok.com/@lacy", label: "@lacy" },
    ],
    audience: [
      { owner: "core", kind: "core", platform: "youtube", handle: "core-yt", url: "https://youtube.com/@core", label: "@core", date: "2026-08-02", count: 100, takenAt: "2026-08-02T03:00:00Z" },
      { owner: "core", kind: "core", platform: "youtube", handle: "core-yt", url: "https://youtube.com/@core", label: "@core", date: "2026-08-31", count: 150, takenAt: "2026-08-31T03:00:00Z" },
      { owner: "adapt", kind: "member", platform: "twitch", handle: "adapt", url: "https://twitch.tv/adapt", label: "@adapt", date: "2026-08-02", count: 200, takenAt: "2026-08-02T03:00:00Z" },
      { owner: "adapt", kind: "member", platform: "twitch", handle: "adapt", url: "https://twitch.tv/adapt", label: "@adapt", date: "2026-08-31", count: 300, takenAt: "2026-08-31T03:00:00Z" },
      { owner: "lacy", kind: "member", platform: "tiktok", handle: "lacy-tt", url: "https://tiktok.com/@lacy", label: "@lacy", date: "2026-08-31", count: 40, takenAt: "2026-08-31T03:00:00Z" },
    ],
    activity: [
      { owner: "core", platform: "youtube", contentType: "video", date: "2026-08-30", count: 1 },
      { owner: "adapt", platform: "twitch", contentType: "live", date: "2026-08-31", count: 1 },
      { owner: "lacy", platform: "tiktok", contentType: "short", date: "2026-08-31", count: 2 },
    ],
    latestActivity: [{ owner: "lacy", platform: "tiktok", title: "New clip", href: "https://tiktok.com/@lacy/video/1", publishedAt: "2026-08-31T10:00:00Z" }],
    streams: [{ slug: "adapt", startedAt: "2026-08-31T09:00:00Z", endedAt: null, totalMinutes: 120, peakViewers: 800, sumViewers: 2_400, sampleCount: 4, lastPolledAt: "2026-08-31T11:55:00Z" }],
    chat: [{ slug: "adapt", date: "2026-08-31", messages: 500, chatters: 120 }],
    twitchRolling: [],
    freshness: { audience: "2026-08-31T03:00:00Z", social: "2026-08-31T10:00:00Z", streams: "2026-08-31T11:55:00Z", chat: "2026-08-31T11:00:00Z", twitchTracker: null },
    ...overrides,
  };
}

test("metrics dashboard combines channels without treating snapshots as unique people", () => {
  const result = deriveMetricsDashboard(dashboard(), "30d");
  assert.equal(result.network.followers, 490);
  assert.equal(result.network.followerGrowth, 150);
  assert.equal(result.core.followers, 150);
  assert.equal(result.members.find((member) => member.owner === "adapt")?.followers, 300);
  assert.equal(result.network.posts, 4);
  assert.equal(result.network.activeCreators, 2);
});

test("metrics dashboard keeps missing period deltas unavailable instead of inventing zero", () => {
  const result = deriveMetricsDashboard(dashboard(), "30d");
  const lacy = result.members.find((member) => member.owner === "lacy");
  assert.equal(lacy?.followerGrowth, null);
  assert.equal(lacy?.channels[0]?.growth, null);
});

test("metrics dashboard marks stream status unavailable when the stored poll is stale", () => {
  const result = deriveMetricsDashboard(dashboard({ freshness: { audience: null, social: null, streams: "2026-08-30T00:00:00Z", chat: null, twitchTracker: null } }), "7d");
  assert.equal(result.members.find((member) => member.owner === "adapt")?.liveStatus, "unavailable");
});

test("public metrics page reads the stored dashboard instead of requesting a live platform snapshot", () => {
  const page = readFileSync(new URL("../app/metrics/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getMetricsDashboard/);
  assert.doesNotMatch(page, /buildLiveResponse|loadMetricsSnapshots|loadStreamHistory|loadChatHistory/);
});
