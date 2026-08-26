import test from "node:test";
import assert from "node:assert/strict";
import {
  WATCH_ROOM_MAX_QUEUE,
  normalizeWatchRoomState,
  parseWatchRoomRealtimeMessage,
} from "../lib/watch-together/types";
import type { Playable } from "../lib/watch/playable";

function playable(key: string): Playable {
  return {
    key,
    kind: "youtube",
    platform: "youtube",
    title: `Video ${key}`,
    poster: "",
    memberSlug: "core",
    memberLabel: "CORE",
    youtubeId: key,
    twitchLogin: null,
    vodId: null,
    clipSrc: null,
    clipId: null,
    url: `https://www.youtube.com/watch?v=${key}`,
  };
}

test("watch-room state is bounded, deduplicated, and excludes the current item from Up Next", () => {
  const current = playable("current1");
  const queue = [current, ...Array.from({ length: 40 }, (_, index) => playable(`video${index}`)), playable("video0")];
  const state = normalizeWatchRoomState({ current, queue });
  assert.equal(state.current?.key, current.key);
  assert.equal(state.queue.length, WATCH_ROOM_MAX_QUEUE);
  assert.equal(new Set(state.queue.map((item) => item.key)).size, WATCH_ROOM_MAX_QUEUE);
  assert.equal(state.queue.some((item) => item.key === current.key), false);
});

test("watch-room playback values are finite, bounded, and bound to the normalized current item", () => {
  const state = normalizeWatchRoomState({
    current: playable("current1"),
    playback: {
      itemKey: "forged-item",
      playing: true,
      positionSeconds: -50,
      durationSeconds: Number.POSITIVE_INFINITY,
      observedAt: "not-a-date",
    },
  }, "2026-08-24T12:00:00.000Z");
  assert.deepEqual(state.playback, {
    itemKey: "current1",
    playing: true,
    positionSeconds: 0,
    durationSeconds: 0,
    observedAt: "2026-08-24T12:00:00.000Z",
  });
});

test("realtime messages accept only the supported bounded protocol", () => {
  assert.equal(parseWatchRoomRealtimeMessage({ type: "request-state" })?.type, "request-state");
  assert.equal(parseWatchRoomRealtimeMessage({ type: "ping", sentAt: "bad" }), null);
  assert.equal(parseWatchRoomRealtimeMessage({ type: "state", version: -1, state: {} }), null);
  assert.equal(parseWatchRoomRealtimeMessage({ type: "admin", command: "grant" }), null);
  const proposal = parseWatchRoomRealtimeMessage({
    type: "queue-proposal",
    queue: [playable("video1"), playable("video1")],
  });
  assert.equal(proposal?.type, "queue-proposal");
  assert.equal(proposal?.type === "queue-proposal" ? proposal.queue.length : -1, 1);
});
