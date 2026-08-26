import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  isActiveTwitchArchiveDuplicate,
  removeActiveTwitchArchiveDuplicates,
} from "../lib/watch/guide-programs";

const guideGridSource = readFileSync(resolve(process.cwd(), "components/watch/GuideGrid.tsx"), "utf8");
const guideCss = readFileSync(resolve(process.cwd(), "app/guide/guide.css"), "utf8");

type Program = {
  id: string;
  slug: string;
  login: string | null;
  startsAt: string;
  endsAt: string | null;
  status: "live" | "replay";
  platform: "twitch" | "youtube";
};

const live: Program = {
  id: "runtime-live-ron",
  slug: "ron",
  login: "StableRonaldo",
  startsAt: "2026-08-20T21:12:29.000Z",
  endsAt: null,
  status: "live",
  platform: "twitch",
};

test("removes Twitch's in-progress archive for a current live stream", () => {
  const archive: Program = {
    id: "catalog-vod-2851780769",
    slug: "ron",
    login: "stableronaldo",
    startsAt: "2026-08-20T21:12:44.000Z",
    endsAt: "2026-08-20T22:34:17.000Z",
    status: "replay",
    platform: "twitch",
  };

  assert.equal(isActiveTwitchArchiveDuplicate(archive, live), true);
  assert.deepEqual(removeActiveTwitchArchiveDuplicates([archive, live]), [live]);
});

test("preserves an older broadcast from a channel that is currently live", () => {
  const olderReplay: Program = {
    id: "catalog-vod-older",
    slug: "ron",
    login: "stableronaldo",
    startsAt: "2026-08-20T18:00:00.000Z",
    endsAt: "2026-08-20T20:00:00.000Z",
    status: "replay",
    platform: "twitch",
  };

  assert.deepEqual(removeActiveTwitchArchiveDuplicates([live, olderReplay]), [live, olderReplay]);
});

test("preserves a completed stream when the channel quickly restarts", () => {
  const completedReplay: Program = {
    id: "catalog-vod-completed",
    slug: "ron",
    login: "stableronaldo",
    startsAt: "2026-08-20T21:11:00.000Z",
    endsAt: "2026-08-20T21:12:00.000Z",
    status: "replay",
    platform: "twitch",
  };

  assert.equal(isActiveTwitchArchiveDuplicate(completedReplay, live), false);
});

test("does not merge another channel or platform", () => {
  const otherChannel: Program = {
    id: "catalog-vod-marlon",
    slug: "marlon",
    login: "marlon",
    startsAt: "2026-08-20T21:12:34.000Z",
    endsAt: "2026-08-20T22:00:00.000Z",
    status: "replay",
    platform: "twitch",
  };
  const youtubeReplay: Program = {
    ...otherChannel,
    id: "youtube-replay-ron",
    slug: "ron",
    login: "stableronaldo",
    platform: "youtube",
  };

  assert.deepEqual(
    removeActiveTwitchArchiveDuplicates([live, otherChannel, youtubeReplay]),
    [live, otherChannel, youtubeReplay],
  );
});

test("the timeline supports pointer dragging without hijacking the page wheel or showing a scrollbar", () => {
  assert.match(guideGridSource, /useDragScroll<HTMLDivElement>\(\{ wheel: "native" \}\)/);
  assert.match(guideCss, /\.guide-timeline-scroll \{[\s\S]{0,420}scrollbar-width: none;/);
  assert.match(guideCss, /\.guide-timeline-scroll::\-webkit-scrollbar \{\s*display: none;/);
});
