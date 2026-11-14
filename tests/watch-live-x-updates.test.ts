import assert from "node:assert/strict";
import test from "node:test";
import { CREW, MEMBERS } from "../lib/members";
import { crewXAuthorSlug } from "../lib/x/crew-roster";
import { advanceXPostWatermark, countNewXPosts, newestXPostId } from "../lib/watch/x-feed-updates";
import { selectWatchHomeXPosts } from "../lib/watch/x-posts";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const xCrew = CREW.filter((crew) => crew.socials.some((social) => social.platform === "x"));
const firstCrew = xCrew[0]!;
const secondCrew = xCrew[1]!;

function crewHandle(crew: typeof firstCrew): string {
  return crew.socials.find((social) => social.platform === "x")!.handle!.replace(/^@/, "");
}

function item(authorSlug: string | null, handle: string, id: string, time = "2026-11-08T12:00:00Z"): WatchItem {
  return {
    id: `x-${id}`,
    kind: "post",
    platform: "x",
    title: `An update from ${handle}`,
    memberSlug: authorSlug,
    memberLabel: handle,
    accountLabel: `@${handle}`,
    poster: "",
    backdrop: "",
    accent: "#db0368",
    href: `https://x.com/${handle}/status/${id}`,
    sourceUrl: `https://x.com/${handle}/status/${id}`,
    publishedAt: time,
  };
}

function catalog(items: WatchItem[]): Pick<WatchCatalog, "byMember" | "byPlatform"> {
  return {
    byMember: MEMBERS.map((member) => ({
      slug: member.slug,
      label: member.stageName,
      accent: member.accent,
      portrait: member.portrait,
      comm: member.comm.name,
      items: [],
    })),
    byPlatform: { x: items, twitch: [], youtube: [], tiktok: [], instagram: [], house: [] },
  };
}

test("member and crew audiences stay separate while the combined audience contains both", () => {
  const source = catalog([
    item(null, "thecoreboys", "2000000000000000001"),
    item("lacy", "LacyHimself", "2000000000000000002"),
    item(crewXAuthorSlug(firstCrew.slug), crewHandle(firstCrew), "2000000000000000003"),
  ]);
  assert.deepEqual(new Set(selectWatchHomeXPosts(source).map((post) => post.author.slug)), new Set(["core", "lacy"]));
  assert.deepEqual(selectWatchHomeXPosts(source, { audience: "crew" }).map((post) => post.author.slug), [crewXAuthorSlug(firstCrew.slug)]);
  assert.deepEqual(new Set(selectWatchHomeXPosts(source, { audience: "all" }).map((post) => post.author.slug)), new Set(["core", "lacy", crewXAuthorSlug(firstCrew.slug)]));
});

test("a prolific crew account cannot crowd any other configured crew member out of the first round", () => {
  const posts = xCrew.flatMap((crew, index) => Array.from({ length: 3 }, (_, offset) => item(
    crewXAuthorSlug(crew.slug),
    crewHandle(crew),
    String(2000000000000000000n + BigInt(index * 10 + offset)),
    new Date(Date.parse("2026-11-08T12:00:00Z") - index * 86_400_000 - offset * 1_000).toISOString(),
  )));
  const selected = selectWatchHomeXPosts(catalog(posts), { audience: "crew", limit: xCrew.length, perMember: 3 });
  assert.equal(selected.length, xCrew.length);
  assert.deepEqual(new Set(selected.map((post) => post.author.slug)), new Set(xCrew.map((crew) => crewXAuthorSlug(crew.slug))));
});

test("crew audience rejects unknown owners, missing namespace, and another person's social handle", () => {
  const posts = selectWatchHomeXPosts(catalog([
    item("crew:unregistered-person", crewHandle(firstCrew), "2000000000000000011"),
    item(firstCrew.slug, crewHandle(firstCrew), "2000000000000000012"),
    item(crewXAuthorSlug(firstCrew.slug), crewHandle(secondCrew), "2000000000000000013"),
    item(crewXAuthorSlug(firstCrew.slug), "thecoreboys", "2000000000000000014"),
    item(crewXAuthorSlug(firstCrew.slug), crewHandle(firstCrew).toUpperCase(), "2000000000000000015"),
  ]), { audience: "crew" });
  assert.deepEqual(posts.map((post) => post.statusId), ["2000000000000000015"]);
  assert.equal(posts[0]?.author.slug, crewXAuthorSlug(firstCrew.slug));
});

test("duplicated crew ingestion rows produce a single post in the combined feed", () => {
  const post = item(crewXAuthorSlug(firstCrew.slug), crewHandle(firstCrew), "2000000000000000020");
  const repeated = { ...post, id: `${post.id}-copy`, sourceUrl: `https://twitter.com/${crewHandle(firstCrew)}/status/2000000000000000020?source=legacy` };
  assert.equal(selectWatchHomeXPosts(catalog([post, repeated]), { audience: "all" }).length, 1);
});

test("new-post detection compares adjacent snowflakes beyond JavaScript integer precision losslessly", () => {
  const previous = "2000000000000000000";
  const next = "2000000000000000001";
  assert.equal(Number(previous), Number(next), "fixture must expose unsafe numeric comparison");
  assert.equal(newestXPostId([{ statusId: previous }, { statusId: next }]), next);
  assert.equal(countNewXPosts([{ statusId: previous }, { statusId: next }], previous), 1);
});

test("new-post notices deduplicate provider rows and ignore older, invalid, and reordered posts", () => {
  const previous = "2000000000000000000";
  const posts = [
    { statusId: "2000000000000000002" },
    { statusId: "1999999999999999999" },
    { statusId: "not-a-status" },
    { statusId: "2000000000000000001" },
    { statusId: "2000000000000000002" },
    { statusId: previous },
  ];
  assert.equal(countNewXPosts(posts, previous), 2);
  assert.equal(countNewXPosts([...posts].reverse(), previous), 2);
  assert.equal(countNewXPosts(posts, "2000000000000000002"), 0);
});

test("initial loads and invalid watermarks do not generate historical-post notices", () => {
  const posts = [{ statusId: "2000000000000000000" }];
  assert.equal(countNewXPosts(posts, null), 0);
  assert.equal(countNewXPosts(posts, "invalid"), 0);
  assert.equal(newestXPostId([{ statusId: "invalid" }, { statusId: "1" }]), null);
  assert.equal(newestXPostId([]), null);
});

test("a delayed or empty snapshot cannot regress the watermark and announce old posts again", () => {
  const latest = "2000000000000000005";
  const olderSnapshot = [{ statusId: "2000000000000000003" }, { statusId: "2000000000000000001" }];
  let watermark = advanceXPostWatermark(latest, olderSnapshot);
  assert.equal(watermark, latest);
  watermark = advanceXPostWatermark(watermark, []);
  assert.equal(watermark, latest);
  assert.equal(countNewXPosts([{ statusId: latest }, ...olderSnapshot], watermark), 0);
  const next = [{ statusId: "2000000000000000006" }, { statusId: latest }];
  assert.equal(countNewXPosts(next, watermark), 1);
  assert.equal(advanceXPostWatermark(watermark, next), "2000000000000000006");
});

test("watermark initialization accepts valid snowflakes and ignores malformed previous values", () => {
  assert.equal(advanceXPostWatermark(null, []), null);
  assert.equal(advanceXPostWatermark("invalid", [{ statusId: "2000000000000000001" }]), "2000000000000000001");
  assert.equal(advanceXPostWatermark("2000000000000000001", [{ statusId: "malformed" }]), "2000000000000000001");
});

test("the first posts in an initially empty audience are announced without announcing imported history", () => {
  const baseline = Date.parse("2026-11-08T12:00:00Z");
  const incoming = [
    { statusId: "2000000000000000001", publishedAt: "2026-11-07T12:00:00Z" },
    { statusId: "2000000000000000002", publishedAt: "2026-11-08T12:00:01Z" },
    { statusId: "2000000000000000002", publishedAt: "2026-11-08T12:00:01Z" },
    { statusId: "2000000000000000003", publishedAt: "2026-11-08T12:00:03Z" },
    { statusId: "2000000000000000004", publishedAt: "invalid" },
    { statusId: "2000000000000000005" },
  ];
  assert.equal(countNewXPosts(incoming, null), 0);
  assert.equal(countNewXPosts(incoming, null, baseline), 2);
  assert.equal(countNewXPosts(incoming, null, Number.NaN), 0);
});
