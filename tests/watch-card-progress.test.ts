import assert from "node:assert/strict";
import test from "node:test";
import { cardPlaybackProgress } from "../lib/watch/card-progress";
import type { WatchItem } from "../lib/watch/types";

const item: WatchItem = {
  id: "catalog-video", kind: "youtube", platform: "youtube", title: "A saved video",
  href: "/watch", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  poster: "", backdrop: "", memberSlug: null, memberLabel: "CORE", accent: "#fff", durationSeconds: 600,
};
const mark = (positionSeconds: number, positionUpdatedAt?: string) => ({
  positionSeconds, positionUpdatedAt, progress: positionSeconds / 600, durationSeconds: 600, completed: false,
});

test("hover resumes the most recent playback across catalog and provider aliases, including a rewind", () => {
  const result = cardPlaybackProgress(item, {
    [item.id]: mark(400, "2026-11-09T12:00:00Z"),
    "yt-abcdefghijk": mark(125, "2026-11-09T12:05:00Z"),
  });
  assert.equal(result.positionSeconds, 125);
  assert.equal(result.durationSeconds, 600);
});

test("a measured rewind to zero wins over older high progress", () => {
  assert.equal(cardPlaybackProgress(item, {
    [item.id]: mark(400, "2026-11-09T12:00:00Z"),
    abcdefghijk: mark(0, "2026-11-09T12:05:00Z"),
  }).positionSeconds, 0);
});

test("legacy percentage-only history resumes from its duration, and completed content restarts", () => {
  const legacy = { ...mark(0), progress: .25 };
  assert.equal(cardPlaybackProgress(item, { abcdefghijk: legacy }).positionSeconds, 150);
  assert.equal(cardPlaybackProgress(item, { abcdefghijk: { ...legacy, completed: true } }).positionSeconds, 0);
});

test("imported embeds and namespaced catalog history resolve the same saved position", () => {
  const imported = { ...item, sourceUrl: undefined, embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk" };
  assert.equal(cardPlaybackProgress(imported, { abcdefghijk: mark(212) }).positionSeconds, 212);
  assert.equal(cardPlaybackProgress(imported, { "youtube:catalog-video": mark(72) }).positionSeconds, 72);
});
