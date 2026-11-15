import assert from "node:assert/strict";
import test from "node:test";
import { packWatchItemLists, unpackWatchItemLists } from "../lib/watch/item-payload";
import type { WatchItem } from "../lib/watch/types";

function item(id: string): WatchItem {
  return {
    id, kind: "clip", platform: "instagram", title: `Post ${id}`,
    poster: `https://cdn.example.com/${id}.jpg?signature=${"a%2Bb%3D".repeat(60)}`,
    backdrop: `https://cdn.example.com/${id}.jpg?signature=${"a%2Bb%3D".repeat(60)}`,
    memberSlug: null, memberLabel: "CORE", accent: "#db0368",
    href: `/theater?id=${id}`, sourceUrl: `https://www.instagram.com/reel/${id}/`,
    embeddable: false, durationSeconds: 0, format: "short",
    focalPoint: { x: 0.25, y: 0.75 },
    captions: [{ src: "https://cdn.example.com/captions.vtt", label: "English", language: "en", default: true }],
  };
}

test("channel transport preserves every field, exact signed artwork, list order and shared items", () => {
  const first = item("first");
  const second = { ...item("second"), backdrop: "https://cdn.example.com/wide.jpg" };
  const input = { items: [first, second, first], continuous: [second, first], "hub:all": [first, second], empty: [] };
  const before = JSON.stringify(input);
  const packed = packWatchItemLists(input);
  const restored = unpackWatchItemLists(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(restored, input);
  assert.equal(restored.items![0], restored.continuous![1]);
  assert.equal(restored.items![0], restored.items![2]);
  assert.equal(JSON.stringify(input), before, "packing must not mutate catalog records");
  assert.equal(packed.items.length, 2);
  assert.equal(packed.artwork.length, 3);
});

test("different versions of the same provider ID are not collapsed", () => {
  const oldItem = item("same-id");
  const refreshed = { ...oldItem, title: "Updated title", mediaUrl: "https://cdn.example.com/fresh.mp4" };
  const restored = unpackWatchItemLists(packWatchItemLists({ old: [oldItem], refreshed: [refreshed] }));
  assert.deepEqual(restored.old, [oldItem]);
  assert.deepEqual(restored.refreshed, [refreshed]);
  assert.notEqual(restored.old![0], restored.refreshed![0]);
});

test("large overlapping schedules transfer artwork and item bodies once", () => {
  const archive = Array.from({ length: 500 }, (_, index) => item(String(index)));
  const input = { all: archive, shorts: archive, continuous: [...archive].reverse() };
  const packed = packWatchItemLists(input);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(input).length * 0.4);
  assert.deepEqual(unpackWatchItemLists(packed), input);
});

test("empty catalogs remain empty", () => {
  assert.deepEqual(unpackWatchItemLists(packWatchItemLists({ live: [], all: [] })), { live: [], all: [] });
});
