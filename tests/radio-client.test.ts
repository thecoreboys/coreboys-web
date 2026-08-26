import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseRadioCue,
  isApprovedRadioAudioUrl,
  normalizeRadioCueRequest,
  normalizeRadioNetworkLiveTakeoverEvent,
  radioCuePriority,
  type RadioCue,
} from "../lib/radio-client";

const tune: RadioCue = {
  id: "core-tune-a",
  kind: "network_tune_in",
  audioUrl: "/audio/network-tunes/core-247.mp3",
  networkSlug: "core",
};

test("radio client only accepts local or HTTP(S) static audio assets", () => {
  assert.equal(isApprovedRadioAudioUrl("/audio/network-tunes/core-247.mp3"), true);
  assert.equal(isApprovedRadioAudioUrl("https://cdn.example.com/cora.mp3"), true);
  assert.equal(isApprovedRadioAudioUrl("javascript:alert(1)"), false);
  assert.equal(isApprovedRadioAudioUrl("data:audio/mp3;base64,AAAA"), false);
});

test("immediate cue requests obtain a stable local-only fallback ID", () => {
  const request = normalizeRadioCueRequest({
    kind: "network_tune_in",
    audioUrl: "/audio/network-tunes/core-247.mp3",
    networkSlug: "core",
  });

  assert.equal(request.id, "network_tune_in:/audio/network-tunes/core-247.mp3");
  assert.equal(request.cue.networkSlug, "core");
  assert.equal(radioCuePriority(request.cue), 70);
});

test("the director accepts the nested non-interrupting 24/7 handoff contract", () => {
  const takeover = normalizeRadioNetworkLiveTakeoverEvent({
    id: "network-live-takeover:core:twitch:stream:123",
    network: { slug: "core", name: "CORE Network", href: "/channels/core" },
    live: {
      sourceId: "twitch:stream:123",
      creatorName: "StableRonaldo",
      creatorSlug: "ron",
      title: "Going live",
    },
    previous: { itemId: "vod-1", kind: "vod", title: "Earlier" },
    policy: { suppressWhileViewerOnLive: true, delivery: "non-interrupting" },
  });

  assert.deepEqual(takeover, {
    networkSlug: "core",
    sourceContentId: "twitch:stream:123",
    creatorName: "StableRonaldo",
    creatorSlug: "ron",
    title: "Going live",
    previous: { id: "vod-1", kind: "vod", title: "Earlier" },
    viewerIsWatchingLive: undefined,
    allowWhenLive: undefined,
    audioUrl: null,
    cue: null,
    priority: null,
    transcript: null,
    caption: null,
  });
});

test("nested active-live state is normalized as a hard takeover suppression signal", () => {
  const takeover = normalizeRadioNetworkLiveTakeoverEvent({
    network: { slug: "core" },
    live: { sourceId: "twitch:stream:456" },
    viewer: { wasWatchingLive: false, activePlayback: { isLive: true } },
    policy: { suppressWhileViewerOnLive: true, delivery: "non-interrupting" },
  });

  assert.equal(takeover?.viewerIsWatchingLive, true);
});

test("cue selection returns an approved random candidate and signals fallback repetition", () => {
  const alternate: RadioCue = { ...tune, id: "core-tune-b", audioUrl: "/audio/network-tunes/flock.mp3" };
  const chosen = chooseRadioCue([tune, alternate], { random: () => 0.99 });

  assert.equal(chosen?.cue.id, "core-tune-b");
  assert.equal(chosen?.repeated, false);
});
