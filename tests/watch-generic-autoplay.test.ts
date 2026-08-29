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

test("home heroes can autoplay direct video sources without a provider iframe", () => {
  assert.match(billboard, /function directVideoPreviewUrl\(value\?: string \| null\): string \| null/);
  assert.match(billboard, /const nativeVideoUrl = directVideoPreviewUrl\(playable\.mediaUrl\)/);
  assert.match(billboard, /<video[\s\S]{0,420}autoPlay[\s\S]{0,140}playsInline[\s\S]{0,140}preload="auto"/);
  assert.match(billboard, /\[180, 650, 1_400\]/);
  assert.match(billboard, /event: "listening", id: `core-billboard-\$\{item\.id\}`/);
});
