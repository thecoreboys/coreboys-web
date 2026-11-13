import assert from "node:assert/strict";
import test from "node:test";
import { pickTopClip, rankWeeklyClips, type TwitchClip, type WeeklyTopClip } from "../lib/watch/weekly-top-clips";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function clip(id: string, views: number, daysAgo: number): TwitchClip {
  return { id, url: `https://clips.twitch.tv/${id}`, broadcaster_id: "1", broadcaster_name: "lacy", title: id,
    view_count: views, created_at: new Date(NOW - daysAgo * DAY).toISOString(), thumbnail_url: `https://example.test/${id}.jpg` };
}

test("pickTopClip keeps the most viewed clip from the last seven days", () => {
  const top = pickTopClip([clip("recent-small", 50, 1), clip("old-huge", 90_000, 9), clip("recent-big", 4_000, 6)], NOW);
  assert.equal(top?.id, "recent-big");
});

test("pickTopClip returns null when nothing was clipped this week", () => {
  assert.equal(pickTopClip([clip("old", 10, 8)], NOW), null);
  assert.equal(pickTopClip([], NOW), null);
});

test("rankWeeklyClips orders creators by views, newer first on ties", () => {
  const base = { memberLabel: "", portrait: "", accent: "#fff", title: "", url: "", thumbnailUrl: "", href: "" };
  const ranked = rankWeeklyClips([
    { ...base, id: "a", memberSlug: "a", viewCount: 10, createdAt: "2026-11-10T00:00:00Z" },
    { ...base, id: "b", memberSlug: "b", viewCount: 500, createdAt: "2026-11-09T00:00:00Z" },
    { ...base, id: "c", memberSlug: "c", viewCount: 10, createdAt: "2026-11-12T00:00:00Z" },
  ] satisfies WeeklyTopClip[]);
  assert.deepEqual(ranked.map((entry) => entry.id), ["b", "c", "a"]);
});
