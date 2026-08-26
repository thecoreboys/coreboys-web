import assert from "node:assert/strict";
import test from "node:test";
import type { WatchItem } from "../lib/watch/types";
import {
  selectShortFormRailItems,
  shortFormPlatformLabel,
  shortFormRailSummary,
} from "../lib/watch/short-form";

function short(
  id: string,
  platform: "youtube" | "instagram" | "tiktok",
  memberSlug: string,
): WatchItem {
  return {
    id,
    kind: platform === "youtube" ? "youtube" : "clip",
    platform,
    title: id,
    poster: "/poster.jpg",
    backdrop: "/poster.jpg",
    memberSlug,
    memberLabel: memberSlug,
    accountLabel: `${memberSlug} main`,
    accent: "#fff",
    href: `/theater?id=${id}`,
    sourceUrl: `https://example.test/${id}`,
    format: "short",
    orientation: "portrait",
  };
}

test("gives every connected short-form platform a turn before one repeats", () => {
  const input = [
    ...Array.from({ length: 8 }, (_, index) => short(`youtube-${index}`, "youtube", "adapt")),
    short("instagram-1", "instagram", "lacy"),
    short("tiktok-1", "tiktok", "jason"),
    short("instagram-2", "instagram", "silky"),
    short("tiktok-2", "tiktok", "ron"),
  ];
  const selected = selectShortFormRailItems(input, 6);

  assert.deepEqual(selected.slice(0, 3).map((item) => item.platform), [
    "youtube",
    "instagram",
    "tiktok",
  ]);
  assert.deepEqual(new Set(selected.map((item) => item.platform)), new Set([
    "youtube",
    "instagram",
    "tiktok",
  ]));
});

test("round-robins creators within a platform and excludes unrelated vertical clips", () => {
  const unrelated: WatchItem = {
    ...short("twitch-clip", "youtube", "adapt"),
    platform: "twitch",
    kind: "clip",
  };
  const selected = selectShortFormRailItems([
    short("adapt-1", "youtube", "adapt"),
    short("adapt-2", "youtube", "adapt"),
    short("lacy-1", "youtube", "lacy"),
    short("adapt-3", "youtube", "adapt"),
    unrelated,
  ]);

  assert.deepEqual(selected.map((item) => item.id), ["adapt-1", "lacy-1", "adapt-2", "adapt-3"]);
  assert.equal(selectShortFormRailItems(selected, 0).length, 0);
});

test("uses exact provider labels and a truthful visible-source summary", () => {
  const items = [
    short("youtube", "youtube", "adapt"),
    short("instagram", "instagram", "lacy"),
    short("tiktok", "tiktok", "jason"),
    short("tiktok-2", "tiktok", "ron"),
  ];

  assert.equal(shortFormPlatformLabel(items[0]!), "YouTube Short");
  assert.equal(shortFormPlatformLabel(items[1]!), "Instagram Reel");
  assert.equal(shortFormPlatformLabel(items[2]!), "TikTok");
  assert.equal(
    shortFormRailSummary(items),
    "1 YouTube Short · 1 Instagram Reel · 2 TikToks",
  );
});
