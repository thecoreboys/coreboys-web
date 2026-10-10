import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Node's type-stripping test runner requires the explicit suffix.
// @ts-expect-error App TypeScript does not enable allowImportingTsExtensions.
import { groupCrossPlatformLiveSources, uniqueCrossPlatformLiveSources } from "../lib/watch/live-source-groups.ts";

function source(key: string, memberSlug: string, platform: string, kind = "live") {
  return { key, memberSlug, memberLabel: "Lacy", platform, kind };
}

test("same-creator YouTube and Twitch lives group as one switchable source", () => {
  const youtube = source("lacy-youtube", "lacy", "youtube");
  const twitch = source("lacy-twitch", "lacy", "twitch");
  const groups = groupCrossPlatformLiveSources([youtube, twitch]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.sources, [youtube, twitch]);
  assert.deepEqual(uniqueCrossPlatformLiveSources([youtube, twitch]), [youtube]);
});

test("Live Now renders one card per creator group with source toggles", () => {
  const modal = readFileSync(resolve(process.cwd(), "components/live/LiveNowModal.tsx"), "utf8");
  assert.match(modal, /const groups = groupCrossPlatformLiveSources\(sources\)/);
  assert.match(modal, /groups\.map\(\(group\) => <LiveNowCard/);
  assert.match(modal, /aria-label="Choose a live source"/);
  assert.match(modal, /aria-pressed=\{active\}/);
  assert.match(modal, /setSelectedKey\(item\.key\)/);
});

test("different creators and single-platform lives stay separate", () => {
  const sources = [
    source("lacy-youtube", "lacy", "youtube"),
    source("lacy-twitch", "lacy", "twitch"),
    source("jason-twitch", "jason", "twitch"),
  ];
  const groups = groupCrossPlatformLiveSources(sources);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0]?.sources, sources.slice(0, 2));
  assert.deepEqual(groups[1]?.sources, [sources[2]]);
  assert.deepEqual(uniqueCrossPlatformLiveSources(sources), [sources[0], sources[2]]);
});

test("non-live uploads are not treated as alternate live sources", () => {
  const live = source("lacy-twitch", "lacy", "twitch");
  const vod = source("lacy-youtube-vod", "lacy", "youtube", "vod");
  assert.deepEqual(groupCrossPlatformLiveSources([live, vod]).map((group) => group.sources), [[live]]);
});
