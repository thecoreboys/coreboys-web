import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { embedFor, itemToPlayable } from "../lib/watch/playable";
import type { WatchItem } from "../lib/watch/types";

const billboard = readFileSync(resolve(process.cwd(), "components/watch/Billboard.tsx"), "utf8");

function watchItem(overrides: Partial<WatchItem> = {}): WatchItem {
  return {
    id: "imported-youtube",
    kind: "youtube",
    platform: "house",
    title: "Imported YouTube program",
    poster: "/poster.jpg",
    backdrop: "/backdrop.jpg",
    memberSlug: null,
    memberLabel: "CORE",
    accent: "#ffffff",
    href: "/theater?kind=youtube&id=not-a-provider-link",
    ...overrides,
  };
}

test("official YouTube embed URLs retain CORE's muted autoplay contract", () => {
  const playable = itemToPlayable(watchItem({
    embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
  }));

  assert.equal(playable?.youtubeId, "abcdefghijk");
  const src = embedFor(playable!, {
    parent: "core.test",
    origin: "https://core.test",
    muted: true,
    autoplay: true,
    loop: false,
    controls: false,
  });
  const url = new URL(src!);
  assert.equal(url.hostname, "www.youtube-nocookie.com");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("mute"), "1");
  assert.equal(url.searchParams.get("controls"), "0");
});

test("direct video sources remain playable after the viewer selects a home hero", () => {
  const mediaUrl = "https://media.core.test/program.mp4";
  const playable = itemToPlayable(watchItem({ mediaUrl }));
  assert.equal(playable?.mediaUrl, mediaUrl);
  assert.equal(playable?.url, mediaUrl);
  assert.match(billboard, /player\.play\(item\)/);
  assert.doesNotMatch(billboard, /<iframe\b|<video\b|autoPlay/);
});
