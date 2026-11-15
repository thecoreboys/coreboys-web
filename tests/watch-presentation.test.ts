import assert from "node:assert/strict";
import test from "node:test";
import { billboardHeadline, compactTitle, groupCrossposts, isRecentItem, readableTitle, watchFormatLabel, watchTitle } from "../lib/watch/presentation";
import type { WatchItem } from "../lib/watch/types";

const short = (patch: Partial<WatchItem> = {}): WatchItem => ({ id: "one", kind: "clip", platform: "tiktok", title: "Prime Lacy is back in the house", memberSlug: "lacy", memberLabel: "Lacy", publishedAt: "2026-11-09T00:00:00Z", format: "short", poster: "", backdrop: "", accent: "red", href: "https://www.tiktok.com/@lacy/video/1", ...patch });

test("display titles clean provider noise without changing source titles", () => {
  const item = short({ title: "☀️ STREAMER AWARD SUIT SHOPPING ☀️ !CLIPPING https://t.co/abc" });
  assert.equal(watchTitle(item), "Streamer award suit shopping");
  assert.match(item.title, /!CLIPPING/);
  assert.equal(readableTitle("Ron &amp; Lacy &#x1f44b;"), "Ron & Lacy");
  assert.equal(readableTitle("🔴SUIT SHOPPING🔴LATE NIGHT GAMING🔴 !live"), "Suit shopping · late night gaming");
  assert.equal(compactTitle("A full title that should end at a word boundary", 24), "A full title that…");
  assert.equal(watchTitle(short({ title: "https://t.co/abc", kind: "post" })), "Lacy · Post");
});

test("mobile billboard headlines preserve complete topics and bound long single-topic titles", () => {
  const title = "🟥 MY LAST STREAM 🟥 CORE DAY 🟥 GINGE IS HERE 🟥 STREAMER AWARDS TOMORROW 🟥 DRAMA 🟥 JOIN !sub";
  assert.equal(billboardHeadline(title), "My last stream · CORE day · ginge is here");
  assert.equal(billboardHeadline("A short feature title"), "A short feature title");
  const sentence = "A single long feature title with several useful details that still need to be available in the disclosure";
  const headline = billboardHeadline(sentence);
  assert.ok(headline.length <= 64);
  assert.ok(headline.endsWith("…"));
  assert.ok(sentence.startsWith(headline.slice(0, -1)));
});

test("cross-post grouping preserves alternate sources without mutating the feed", () => {
  const original = short();
  const instagram = short({ id: "two", platform: "instagram", href: "https://www.instagram.com/reel/abc/" });
  const grouped = groupCrossposts([original, instagram]);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0]?.alternateSources, [{ platform: "instagram", href: instagram.href }]);
  assert.equal(original.alternateSources, undefined);
  assert.equal(groupCrossposts([short({ title: "Prime Lacy is Back🤯🔥 #fyp #viral #lacy #aura" }), short({ id: "ig", platform: "instagram", title: "Prime Lacy is Back🤯🔥 #lacy #aura" })]).length, 1);
  assert.equal(groupCrossposts([short({ title: "My journey to the Pirate Shop Token 🥹 (Twitch - StableRonaldo) #fyp" }), short({ id: "ig", platform: "instagram", title: "My journey to the Pirate Shop Token 🥹 #fortnite" })]).length, 1);
});

test("similar captions do not merge other creators, old uploads, or vague titles", () => {
  assert.equal(groupCrossposts([short(), short({ id: "two", platform: "instagram", memberSlug: "ron" })]).length, 2);
  assert.equal(groupCrossposts([short(), short({ id: "two", platform: "instagram", publishedAt: "2025-11-09T00:00:00Z" })]).length, 2);
  assert.equal(groupCrossposts([short({ title: "Hello" }), short({ id: "two", title: "Hello", platform: "instagram" })]).length, 2);
});

test("replay and freshness labels do not imply an active live stream or future publication", () => {
  assert.equal(watchFormatLabel(short({ kind: "vod", format: "live" })), "Replay");
  assert.equal(watchFormatLabel(short({ kind: "live" })), "Live");
  assert.equal(isRecentItem({ publishedAt: "2026-11-10T00:00:00Z" }, Date.parse("2026-11-09T00:00:00Z")), false);
  assert.equal(isRecentItem({ publishedAt: "invalid" }), false);
});
