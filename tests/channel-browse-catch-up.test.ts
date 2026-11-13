import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  browseCoverage,
  browseFacets,
  browseFormatOf,
  browseSearchParams,
  browseSignalNote,
  filterBrowseItems,
  parseBrowseFilters,
  rankBrowseItems,
  type BrowseFilters,
} from "../lib/watch/channel-browse";
import { catchUpKindOf, groupCatchUp, isCatchUpAllowed, selectCatchUp, socialContentTypeForCatchUp } from "../lib/catch-up";
import type { WatchItem } from "../lib/watch/types";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const DAY = 86_400_000;

function item(id: string, patch: Partial<WatchItem> = {}): WatchItem {
  return {
    id, kind: "youtube", platform: "youtube", title: id, poster: "", backdrop: "", memberSlug: "lacy",
    memberLabel: "Lacy", accent: "#fff", href: `/theater?id=${id}`, publishedAt: new Date(NOW - DAY).toISOString(), ...patch,
  };
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

const filters = (patch: Partial<BrowseFilters> = {}): BrowseFilters => ({ platform: "all", format: "all", sort: "latest", window: "all", ...patch });

test("browse filters round-trip through the URL and reject unknown values", () => {
  const parsed = parseBrowseFilters(new URLSearchParams("platform=tiktok&sort=top&window=week&format=nope"));
  assert.deepEqual(parsed, { platform: "tiktok", format: "all", sort: "top", window: "week" });
  assert.equal(browseSearchParams(parsed).toString(), "platform=tiktok&sort=top&window=week");
  assert.equal(browseSearchParams(filters()).toString(), "");
});

test("each item has exactly one browse format", () => {
  assert.equal(browseFormatOf(item("a", { kind: "vod", platform: "twitch" })), "broadcasts");
  assert.equal(browseFormatOf(item("b", { kind: "live", platform: "twitch" })), "live");
  assert.equal(browseFormatOf(item("c", { kind: "clip", platform: "twitch" })), "clips");
  assert.equal(browseFormatOf(item("d", { format: "short" })), "shorts");
  assert.equal(browseFormatOf(item("e", { platform: "tiktok", kind: "clip" })), "shorts");
  assert.equal(browseFormatOf(item("f", { platform: "instagram", kind: "clip" })), "reels");
  assert.equal(catchUpKindOf(item("e2", { platform: "tiktok", kind: "clip" })), "short");
  assert.equal(browseFormatOf(item("g", { platform: "instagram", kind: "post", format: "photo" })), "photos");
  assert.equal(browseFormatOf(item("h", { platform: "x", kind: "post" })), "posts");
  assert.equal(browseFormatOf(item("i")), "videos");
});

test("time windows filter by publish date, keep live rooms, and facets count the other dimension", () => {
  const items = [
    item("new"), item("old", { publishedAt: new Date(NOW - 40 * DAY).toISOString() }),
    item("live", { kind: "live", platform: "twitch", publishedAt: undefined }),
    item("tt", { platform: "tiktok", kind: "post" }),
  ];
  assert.deepEqual(filterBrowseItems(items, filters({ window: "week" }), NOW).map((entry) => entry.id), ["new", "live", "tt"]);
  assert.deepEqual(filterBrowseItems(items, filters({ platform: "youtube" }), NOW).map((entry) => entry.id), ["new", "old"]);
  const facets = browseFacets(items, { platform: "youtube", format: "all" });
  assert.equal(facets.formats.videos, 2);
  assert.equal(facets.formats.shorts, undefined);
  assert.equal(facets.platforms.tiktok, 1);
});

test("ranking uses only real signals and lists everything else newest first", () => {
  const items = [
    item("a", { publishedAt: new Date(NOW - 3 * DAY).toISOString() }),
    item("b", { publishedAt: new Date(NOW - 2 * DAY).toISOString() }),
    item("tt", { platform: "tiktok", kind: "post", publishedAt: new Date(NOW - DAY).toISOString() }),
    item("clip-1", { kind: "clip", platform: "twitch" }),
  ];
  const signals = { "youtube:a": { views: 900 }, "youtube:b": { views: 50, likes: 3 }, "twitch:clip-1": { upvotes: 4 } };
  const ranked = rankBrowseItems(items, signals, "top");
  assert.deepEqual(ranked.map((entry) => [entry.item.id, entry.rank]), [["a", 1], ["b", 2], ["clip-1", 3], ["tt", null]]);
  const coverage = browseCoverage(items, signals, "top");
  assert.deepEqual(coverage.platformsWithoutSignal, ["tiktok"]);
  assert.match(browseSignalNote(filters({ sort: "top" }), coverage) ?? "", /TikTok doesn't share view counts/);
  const youtubeMissing = browseCoverage([item("z")], {}, "top");
  assert.match(browseSignalNote(filters({ sort: "top" }), youtubeMissing) ?? "", /YouTube view counts aren't available right now/);
  const none = browseCoverage([items[2]!], {}, "top");
  assert.match(browseSignalNote(filters({ sort: "top" }), none) ?? "", /newest first/);
});

test("catch-up selects unseen items after the cursor and honours per-creator, per-type rules", () => {
  const since = NOW - 2 * DAY;
  const items = [
    item("fresh"),
    item("seen"),
    item("watched"),
    item("stale", { publishedAt: new Date(NOW - 5 * DAY).toISOString() }),
    item("muted-short", { format: "short" }),
    item("vod", { kind: "vod", platform: "twitch", memberSlug: "ron", memberLabel: "Ron" }),
    item("live-old", { kind: "live", platform: "twitch", live: { startedAt: new Date(NOW - 3 * DAY).toISOString() } }),
  ];
  const rules = [{ memberSlug: "lacy", contentType: "short" as const, enabled: false }];
  const selection = selectCatchUp({
    items, since, now: NOW, rules,
    seen: new Set(["youtube:seen"]), watched: new Set(["youtube:watched"]),
  });
  assert.deepEqual(selection.entries.map((entry) => entry.item.id).sort(), ["fresh", "vod"]);
  assert.deepEqual(selection.liveNow.map((entry) => entry.item.id), ["live-old"]);
  assert.equal(isCatchUpAllowed(item("x", { format: "short" }), rules), false);
  assert.equal(socialContentTypeForCatchUp(catchUpKindOf(item("y", { kind: "vod", platform: "twitch" }))), "live");
  assert.deepEqual(groupCatchUp(selection.entries).map((group) => [group.memberSlug, group.count]), [["lacy", 1], ["ron", 1]]);
});

test("catch-up never looks back more than 30 days, even for a stale cursor", () => {
  const items = [item("ancient", { publishedAt: new Date(NOW - 45 * DAY).toISOString() }), item("recent")];
  const selection = selectCatchUp({ items, since: 0, now: NOW, rules: [], seen: new Set(), watched: new Set() });
  assert.deepEqual(selection.entries.map((entry) => entry.item.id), ["recent"]);
});

test("catch-up and browse APIs are private or bounded, and the schema ships as an additive migration", () => {
  const catchUpRoute = source("app/api/account/catch-up/route.ts");
  const browseRoute = source("app/api/watch/channels/[slug]/browse/route.ts");
  const migration = source("scripts/migrations/072_fan_catch_up.sql");
  const runner = source("scripts/apply-web-migrations.mjs");
  const server = source("lib/catch-up-server.ts");
  assert.match(catchUpRoute, /Cache-Control", "private, no-store"/);
  assert.match(catchUpRoute, /getCurrentFanUserId/);
  assert.match(browseRoute, /BROWSE_PAGE_SIZE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fan_catch_up_state/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /DROP |ALTER TABLE/);
  assert.match(runner, /"072_fan_catch_up\.sql"/);
  // Deploying before the migration must degrade, not fail.
  assert.match(server, /serving read-only catch-up/);
});

test("channel pages render every section on one page with a deep-linkable sticky nav", () => {
  const page = source("components/watch/NetworkChannelPage.tsx");
  for (const id of ["watch", "schedule", "history", "photos", "posts", "about", "fan-mail"]) {
    assert.match(page, new RegExp(`id="${id}"`), `section #${id} is rendered`);
  }
  // Sections are no longer hidden behind tabs.
  assert.doesNotMatch(page, /activeSection === "(?:schedule|photos|about|posts)" \?/);
  assert.doesNotMatch(page, /role="tabpanel"/);
  assert.match(page, /aria-current=\{active === id \? "location" : undefined\}/);
  assert.match(page, /CHANNEL_SECTION_ALIASES[^\n]*crew: "about"/);
  // History and Photos only fetch once the reader scrolls near them.
  assert.match(page, /nearSections\.has\("history"\) \? `\/api\/watch\/channels\/\$\{channel\.slug\}\/extras\?section=history`/);
  assert.match(page, /nearSections\.has\("photos"\) \? `\/api\/watch\/channels\/\$\{channel\.slug\}\/extras\?section=photos`/);
});
