import assert from "node:assert/strict";
import test from "node:test";
import { formatDisplayLabel, formatHandleDisplay, watchAttributionLabel } from "../lib/watch/display-label";
import type { WatchItem } from "../lib/watch/types";

function item(overrides: Partial<WatchItem>): WatchItem {
  return {
    id: "test",
    kind: "live",
    platform: "twitch",
    title: "Live",
    poster: "",
    backdrop: "",
    memberSlug: "jason",
    memberLabel: "JasonTheWeen",
    accountLabel: "@jasontheween",
    accent: "#fff",
    href: "/watch/live/jasontheween",
    live: { login: "jasontheween" },
    ...overrides,
  };
}

test("capitalizes lowercase handles without changing their structure", () => {
  assert.equal(formatHandleDisplay("@marlon"), "@Marlon");
  assert.equal(formatHandleDisplay("@lacy.himself"), "@Lacy.himself");
  assert.equal(formatHandleDisplay("@silky_szn"), "@Silky_szn");
});

test("preserves canonical mixed and uppercase handle casing", () => {
  assert.equal(formatHandleDisplay("@FaZeAdapt"), "@FaZeAdapt");
  assert.equal(formatHandleDisplay("@JasonTheWeenIRL"), "@JasonTheWeenIRL");
  assert.equal(formatHandleDisplay("@CORE"), "@CORE");
});

test("uses editorial member casing for known Twitch identities", () => {
  assert.equal(watchAttributionLabel(item({})), "@JasonTheWeen");
  assert.equal(
    watchAttributionLabel(item({ memberSlug: "ron", memberLabel: "StableRonaldo", accountLabel: "@stableronaldo", live: { login: "stableronaldo" } })),
    "@StableRonaldo",
  );
});

test("capitalizes composite attribution handles without changing separators", () => {
  assert.equal(formatDisplayLabel("Marlon · @marlon3lg"), "Marlon · @Marlon3lg");
});
