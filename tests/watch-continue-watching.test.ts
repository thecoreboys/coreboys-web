import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { buildWatchHeroItems, CONTINUE_WATCHING_CLOCK_SKEW_MS, CONTINUE_WATCHING_TTL_MS, isContinueWatchingMark, selectContinueWatchingItems, selectTwitchHeroBroadcasts } from "../lib/watch/continue-watching.ts";
import type { WatchItem } from "../lib/watch/types";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

function item(id: string, overrides: Partial<WatchItem> = {}): WatchItem {
  return {
    id,
    kind: "youtube",
    platform: "youtube",
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#fff",
    href: `/theater?kind=youtube&id=${id}`,
    format: "long",
    ...overrides,
  };
}

function at(offsetMs: number) {
  return new Date(NOW + offsetMs).toISOString();
}

test("requires 60 observed seconds while leaving shorter progress intact", () => {
  const short = {
    seconds: 59,
    progress: 0.8,
    positionUpdatedAt: at(0),
    updatedAt: at(0),
  };
  const snapshot = structuredClone(short);

  assert.equal(isContinueWatchingMark(short, NOW), false);
  assert.equal(isContinueWatchingMark({ ...short, seconds: 60 }, NOW), true);
  assert.deepEqual(short, snapshot);
});

test("expires after 30 days of playback and a hover does not refresh it", () => {
  assert.equal(isContinueWatchingMark({
    seconds: 60,
    positionUpdatedAt: at(-CONTINUE_WATCHING_TTL_MS),
    updatedAt: at(0),
  }, NOW), true);
  assert.equal(isContinueWatchingMark({
    seconds: 60,
    positionUpdatedAt: at(-CONTINUE_WATCHING_TTL_MS - 1),
    updatedAt: at(0),
  }, NOW), false);
  assert.equal(isContinueWatchingMark({ seconds: 60, updatedAt: at(0) }, NOW), true);
  assert.equal(isContinueWatchingMark({ seconds: 60, positionUpdatedAt: null, updatedAt: at(0) }, NOW), true);
  assert.equal(isContinueWatchingMark({ seconds: 0, updatedAt: at(0) }, NOW), false);
});

test("rejects completed, invalid, and implausibly future marks", () => {
  const recent = { seconds: 60, positionUpdatedAt: at(0), updatedAt: at(0) };
  assert.equal(isContinueWatchingMark({ ...recent, completed: true }, NOW), false);
  assert.equal(isContinueWatchingMark({ ...recent, progress: 0.9 }, NOW), false);
  assert.equal(isContinueWatchingMark({ ...recent, positionUpdatedAt: "not-a-date" }, NOW), false);
  assert.equal(isContinueWatchingMark({
    ...recent,
    positionUpdatedAt: at(CONTINUE_WATCHING_CLOCK_SKEW_MS + 1),
  }, NOW), false);
  assert.equal(isContinueWatchingMark({
    ...recent,
    positionUpdatedAt: at(CONTINUE_WATCHING_CLOCK_SKEW_MS),
  }, NOW), true);
});

test("combines aliases, filters completion, deduplicates, and orders by playback recency", () => {
  const first = item("catalog-a");
  const duplicate = item("duplicate-a");
  const second = item("catalog-b");
  const completed = item("catalog-complete");
  const items = [second, duplicate, first, completed];
  const marks = {
    "catalog-a": { seconds: 0, progress: 0, updatedAt: at(0) },
    "provider-a": { seconds: 75, progress: 0.2, positionUpdatedAt: at(-1_000), updatedAt: at(-1_000) },
    "catalog-b": { seconds: 90, progress: 0.3, positionUpdatedAt: at(-2_000), updatedAt: at(-2_000) },
    "catalog-complete": { seconds: 70, progress: 0.25, positionUpdatedAt: at(-500), updatedAt: at(-500) },
    "provider-complete": { seconds: 500, progress: 0.95, positionUpdatedAt: at(-3_000), updatedAt: at(-3_000) },
  };
  const refs = (entry: WatchItem) => entry.id === "catalog-a" || entry.id === "duplicate-a"
    ? [entry.id, "provider-a"]
    : entry.id === "catalog-complete"
      ? [entry.id, "provider-complete"]
      : [entry.id];

  assert.deepEqual(
    selectContinueWatchingItems(items, marks, refs, { now: NOW }).map((entry) => entry.id),
    ["duplicate-a", "catalog-b"],
  );
  assert.deepEqual(selectContinueWatchingItems(items, marks, refs, { limit: 0, now: NOW }), []);
});

test("keeps the existing hero order and appends no more than three distinct resumes", () => {
  const live = item("live", { kind: "live", format: "live", platform: "twitch" });
  const latest = item("latest");
  const resumes = [latest, item("resume-1"), item("resume-2"), item("resume-3"), item("resume-4")];

  assert.deepEqual(
    buildWatchHeroItems([live], resumes, latest).map((entry) => entry.id),
    ["live", "latest", "resume-1", "resume-2", "resume-3"],
  );
});

test("selects the newest embeddable Twitch broadcasts for the home hero", () => {
  const twitchVod = (id: string, publishedAt: string, overrides: Partial<WatchItem> = {}) => item(id, {
    kind: "vod",
    platform: "twitch",
    publishedAt,
    previewStrategy: "embed",
    embeddable: true,
    twitch: { vodId: id },
    ...overrides,
  });
  const selected = selectTwitchHeroBroadcasts([
    twitchVod("older", "2026-08-20T12:00:00Z"),
    twitchVod("newest", "2026-08-22T12:00:00Z"),
    twitchVod("middle", "2026-08-21T12:00:00Z"),
    twitchVod("external", "2026-08-23T12:00:00Z", { previewStrategy: "external" }),
    item("youtube-vod", { kind: "vod", platform: "youtube" }),
  ]);

  assert.deepEqual(selected.map((entry) => entry.id), ["newest", "middle", "older"]);
});

test("continue selection excludes non-resumable formats but permits unknown duration", () => {
  const entries = [
    item("eligible"),
    item("live-kind", { kind: "live" }),
    item("live-format", { format: "live" }),
    item("post", { kind: "post", platform: "x" }),
    item("photo", { format: "photo", platform: "instagram" }),
  ];
  const marks = Object.fromEntries(entries.map((entry) => [entry.id, {
    seconds: 60,
    progress: 0,
    positionUpdatedAt: at(0),
    updatedAt: at(0),
  }]));

  assert.deepEqual(
    selectContinueWatchingItems(entries, marks, (entry) => [entry.id], { now: NOW })
      .map((entry) => entry.id),
    ["eligible"],
  );
});
