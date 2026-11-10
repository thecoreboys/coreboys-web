import assert from "node:assert/strict";
import test from "node:test";
import { heroLiveIdentity, newlyLiveHero } from "../lib/watch/hero-live-priority";
import type { WatchItem } from "../lib/watch/types";

function item(id: string, kind: WatchItem["kind"], startedAt?: string): WatchItem {
  return { id, kind, platform: "twitch", title: id, poster: "", backdrop: "", memberSlug: "lacy", memberLabel: "Lacy", accent: "#fff", href: "/", live: startedAt ? { startedAt } : undefined };
}

test("new broadcasts take priority without promoting cached live-format replays", () => {
  const first = item("live-lacy", "live", "2026-11-10T10:00:00Z");
  const updated = { ...first, title: "New title" };
  const rewind = { ...item("old", "vod"), format: "live" as const };
  const previous = new Set([heroLiveIdentity(first)!]);
  assert.equal(newlyLiveHero(previous, [rewind, updated]), null);
  const second = item("live-adapt", "live", "2026-11-10T11:00:00Z");
  assert.equal(newlyLiveHero(previous, [updated, second]), heroLiveIdentity(second));
  assert.equal(newlyLiveHero(previous, [item("live-lacy", "live", "2026-11-10T12:00:00Z")])?.includes("12:00"), true);
});
