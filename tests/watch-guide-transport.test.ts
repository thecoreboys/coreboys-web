import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetworkChannel } from "../lib/watch/channels";
import { fetchWatchGuide, type GuidePayload, type GuideProgram } from "../lib/watch/guide-response";
import { packGuidePayload, unpackGuidePayload } from "../lib/watch/guide-transport";
import type { WatchItem } from "../lib/watch/types";

const item: WatchItem = {
  id: "clip-one", kind: "clip", platform: "tiktok", title: "A real clip",
  poster: "https://cdn.example.com/one.jpg?signature=a%2Bb%3D", backdrop: "https://cdn.example.com/one.jpg?signature=a%2Bb%3D",
  memberSlug: null, memberLabel: "CORE", accent: "#db0368", href: "/theater?id=clip-one", durationSeconds: 45,
};
const program: GuideProgram = {
  id: "catalog-clip-one", slug: "house", login: null, title: item.title, game: null,
  startsAt: "2026-11-08T12:00:00Z", endsAt: null, status: "published", platform: "tiktok",
  thumbnailUrl: item.poster, vodId: null, youtubeId: null, sourceUrl: item.href, watchItem: item,
};
const snapshot: GuidePayload = {
  serverNow: "2026-11-09T00:00:00Z", horizonEnd: "2026-11-16T00:00:00Z",
  programs: [program, { ...program, id: "scheduled", status: "upcoming", watchItem: undefined }],
  networks: [{ network: resolveNetworkChannel("core")!, rows: [{
    id: "core:continuous", networkSlug: "core", kind: "continuous", label: "24/7", description: "The house", timelineSlug: "house",
    channel: { id: "core:continuous", title: "CORE", subtitle: "24/7", href: "/channels/core", artwork: "/brand/logo-core-white.png" },
    items: [item],
  }] }],
  sources: { socialTimeline: "ok", twitchSchedule: "empty" },
};

test("compact guide preserves all programs and channel rows through JSON", () => {
  const packed = packGuidePayload(snapshot);
  const restored = unpackGuidePayload(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(packed.itemPayload.items.length, 1);
  assert.equal(restored.programs[0]!.watchItem, restored.networks![0]!.rows[0]!.items[0]);
});

test("guide fetch opts into compact responses and restores the public client shape", async (context) => {
  context.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("X-CORE-Guide-Format"), "compact-v1");
    return Response.json(packGuidePayload(snapshot));
  });
  assert.deepEqual(await fetchWatchGuide("/api/watch/guide"), JSON.parse(JSON.stringify(snapshot)));
});

test("malformed compact responses reject so a valid cached guide can stay visible", async (context) => {
  const packed = packGuidePayload(snapshot);
  packed.itemPayload.lists.programs = [999];
  context.mock.method(globalThis, "fetch", async () => Response.json(packed));
  await assert.rejects(fetchWatchGuide("/api/watch/guide"), /invalid response/);
});

test("an empty guide without networks remains valid", () => {
  const empty: GuidePayload = { serverNow: snapshot.serverNow, horizonEnd: snapshot.horizonEnd, programs: [] };
  assert.deepEqual(unpackGuidePayload(packGuidePayload(empty)), empty);
});

test("missing program and network references reject incomplete snapshots", () => {
  const programMismatch = packGuidePayload(snapshot);
  programMismatch.programs[0]!.watchItem = 999;
  assert.throws(() => unpackGuidePayload(programMismatch), /Invalid guide program reference/);
  const rowMismatch = packGuidePayload(snapshot);
  delete rowMismatch.itemPayload.lists["row:core:continuous"];
  assert.throws(() => unpackGuidePayload(rowMismatch), /Invalid guide row reference/);
});
