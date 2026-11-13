import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CURATED_ORIGINAL_EPISODES, curatedOriginalItems, withCuratedOriginalItems } from "../lib/core-originals-curated";
import { originalMatchReason, originalSourceKey } from "../lib/core-originals-matching";
import { playableFromUrl } from "../lib/watch/playable";
import type { CoreOriginalItem } from "../lib/core-originals";

const seedSlugs = [...readFileSync("lib/core-originals.ts", "utf8").matchAll(/^\s*\["([a-z0-9-]+)", "/gm)].map((match) => match[1]);

test("curated Originals only reference seeded collections, in episode order, without duplicates", () => {
  assert.ok(seedSlugs.length >= 10);
  for (const [slug, episodes] of Object.entries(CURATED_ORIGINAL_EPISODES)) {
    assert.ok(seedSlugs.includes(slug), `${slug} is not a seeded Original`);
    assert.ok(episodes.length > 0, `${slug} has an empty curated list`);
    const dates = episodes.map((episode) => episode.publishedAt);
    assert.deepEqual(dates, [...dates].sort(), `${slug} must stay in episode (oldest-first) order`);
    assert.equal(new Set(episodes.map((episode) => episode.id)).size, episodes.length, `${slug} repeats an episode`);
    for (const episode of episodes) {
      assert.match(episode.id, /^[\w-]{11}$/, `${slug}: ${episode.id} is not a YouTube id`);
      assert.match(episode.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("CORE-branded collections only include uploads from after the group launched", () => {
  for (const slug of ["core-x-vegas", "core-environment", "core-po-box-openings", "basketball-segments"]) {
    for (const episode of CURATED_ORIGINAL_EPISODES[slug] ?? []) assert.ok(episode.publishedAt >= "2026-04-30", `${slug}: ${episode.title}`);
  }
});

test("every curated episode opens in the site player as a YouTube reference", () => {
  const items = curatedOriginalItems({ id: "original-1", slug: "jason-the-ween" });
  assert.equal(items.length, 7);
  assert.deepEqual(items.map((item) => item.sortOrder), [0, 1, 2, 3, 4, 5, 6]);
  for (const slug of Object.keys(CURATED_ORIGINAL_EPISODES)) {
    for (const item of curatedOriginalItems({ id: "x", slug })) {
      const playable = playableFromUrl(item.sourceUrl);
      assert.equal(playable?.platform, "youtube");
      assert.equal(item.status, "approved");
      assert.match(item.posterUrl ?? "", /^https:\/\/i\.ytimg\.com\/vi\//);
    }
  }
});

test("reviewed database rows take precedence over curated entries and rejected rows stay hidden", () => {
  const original = { id: "o1", slug: "stable-99-kill-lead", title: "99", summary: null, posterUrl: "/p.webp", enabled: true, sortOrder: 0 };
  const row = (sourceUrl: string, status: CoreOriginalItem["status"]): CoreOriginalItem => ({
    id: `db-${status}`, originalId: "o1", sourceUrl, platform: "youtube", title: status, subtitle: null, posterUrl: null,
    format: "long", status, recommendationNote: null, sortOrder: 100,
  });
  const curated = curatedOriginalItems(original);
  const snapshot = withCuratedOriginalItems({ originals: [original], items: [
    row(`https://youtu.be/${curated[0]!.sourceUrl.slice(-11)}`, "rejected"),
    row(`https://www.youtube.com/watch?v=${curated[1]!.sourceUrl.slice(-11)}&t=5`, "approved"),
  ] });
  const keys = snapshot.items.map((item) => originalSourceKey(item.sourceUrl));
  assert.ok(!keys.includes(originalSourceKey(curated[0]!.sourceUrl)), "a rejected source must not be republished from code");
  assert.equal(snapshot.items.filter((item) => originalSourceKey(item.sourceUrl) === originalSourceKey(curated[1]!.sourceUrl)).length, 1);
  assert.ok(snapshot.items.every((item) => item.status === "approved"));
  assert.equal(snapshot.items.length, curated.length - 1);
});

test("title rules recognise the curated series so new episodes reach the approval queue", () => {
  assert.ok(originalMatchReason("jason-the-ween", { title: "I Survived 7 Days Stranded On An Island! (Day 8)", kind: "youtube" }));
  assert.ok(originalMatchReason("maybach-mondays", { title: "Stuck In A Maybach With Someone New!", kind: "youtube" }));
  assert.ok(originalMatchReason("core-environment", { title: "Back At Alveus Sanctuary!", kind: "youtube" }));
  assert.ok(originalMatchReason("stable-99-kill-lead", { title: "I Gave The Worst Fortnite Player A 99 Kill Lead..", kind: "youtube" }));
});
