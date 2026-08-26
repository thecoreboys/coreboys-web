import assert from "node:assert/strict";
import test from "node:test";
import {
  createNetworkLiveTakeoverDetail,
  networkLiveSourceId,
  shouldAnnounceNetworkLiveTakeover,
} from "../lib/watch/live-takeover";
import type { WatchItem } from "../lib/watch/types";

function item(overrides: Partial<WatchItem> = {}): WatchItem {
  return {
    id: "vod-1",
    kind: "youtube",
    format: "long",
    platform: "youtube",
    title: "Regular programming",
    poster: "/poster.jpg",
    backdrop: "/backdrop.jpg",
    memberSlug: "adapt",
    memberLabel: "Adapt",
    accent: "#ef4444",
    href: "/watch/vod-1",
    ...overrides,
  };
}

const live = item({
  id: "live-stable",
  kind: "live",
  format: "live",
  platform: "twitch",
  title: "Stable is live",
  live: {
    login: "stableronaldo",
    streamId: "987654321",
    startedAt: "2026-08-25T15:00:00.000Z",
  },
});

test("announces only an observed non-live to live transition on a 24/7 network", () => {
  assert.equal(shouldAnnounceNetworkLiveTakeover({
    mode: "continuous",
    previous: item(),
    next: live,
    activePlayback: item(),
  }), true);

  assert.equal(shouldAnnounceNetworkLiveTakeover({
    mode: "live",
    previous: item(),
    next: live,
    activePlayback: item(),
  }), false);
  assert.equal(shouldAnnounceNetworkLiveTakeover({
    mode: "continuous",
    previous: null,
    next: live,
    activePlayback: item(),
  }), false);
  assert.equal(shouldAnnounceNetworkLiveTakeover({
    mode: "continuous",
    previous: live,
    next: live,
    activePlayback: item(),
  }), false);
});

test("an already focused live stream suppresses the takeover cue", () => {
  assert.equal(shouldAnnounceNetworkLiveTakeover({
    mode: "continuous",
    previous: item(),
    next: live,
    activePlayback: live,
  }), false);
});

test("uses an immutable provider stream identity and exposes a non-interrupting contract", () => {
  assert.equal(networkLiveSourceId(live), "twitch:stream:987654321");
  const detail = createNetworkLiveTakeoverDetail({
    network: { slug: "core", name: "CORE Network", href: "/channels/core" },
    previous: item(),
    next: live,
    activePlayback: { key: "vod-1", kind: "youtube", format: "long", platform: "youtube", title: "Regular programming" },
    triggeredAt: "2026-08-25T15:01:00.000Z",
  });

  assert.ok(detail);
  assert.equal(detail?.id, "network-live-takeover:core:twitch:stream:987654321");
  assert.equal(detail?.live.creatorName, "Adapt");
  assert.equal(detail?.viewer.activePlayback?.key, "vod-1");
  assert.equal(detail?.viewer.wasWatchingLive, false);
  assert.equal(detail?.policy.viewerIsWatchingLive, false);
  assert.equal(detail?.policy.delivery, "non-interrupting");
  assert.equal(detail?.policy.suppressWhileViewerOnLive, true);
  assert.equal(createNetworkLiveTakeoverDetail({
    network: { slug: "core", name: "CORE Network", href: "/channels/core" },
    previous: item(),
    next: live,
    activePlayback: { key: "already-live", kind: "live", format: "live", platform: "twitch" },
  }), null);
});
