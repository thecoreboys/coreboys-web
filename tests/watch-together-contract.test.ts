import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("private watch rooms store only hashed invites and expire signaling", () => {
  const migration = read("scripts/migrations/028_watch_together_rooms.sql");
  const runner = read("scripts/apply-web-migrations.mjs");
  assert.match(migration, /invite_hash\s+text NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /invite_code\s+text/i);
  assert.match(migration, /expires_at\s+timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '5 minutes'\)/);
  assert.match(migration, /REFERENCES fan_users\(id\) ON DELETE CASCADE/);
  assert.match(runner, /028_watch_together_rooms\.sql/);
});

test("hosting is entitlement-protected while invited signed-in guests remain free", () => {
  const createRoute = read("app/api/watch/rooms/route.ts");
  const joinRoute = read("app/api/watch/rooms/join/route.ts");
  const updateRoute = read("app/api/watch/rooms/[roomId]/route.ts");
  assert.match(createRoute, /requireAccountEntitlement/);
  assert.match(createRoute, /featureId: "rooms\.private"/);
  assert.match(updateRoute, /parsed\.data\.scope === "host"/);
  assert.match(updateRoute, /featureId: "rooms\.private"/);
  assert.match(joinRoute, /getCurrentFanUserId\(\)/);
  assert.doesNotMatch(joinRoute, /requireAccountEntitlement/);
});

test("cookie-authenticated room mutations reject cross-origin requests", () => {
  const shared = read("app/api/watch/rooms/_shared.ts");
  const createRoute = read("app/api/watch/rooms/route.ts");
  const joinRoute = read("app/api/watch/rooms/join/route.ts");
  const updateRoute = read("app/api/watch/rooms/[roomId]/route.ts");
  const signalRoute = read("app/api/watch/rooms/[roomId]/signal/route.ts");
  assert.match(shared, /requestHasSameOrigin/);
  assert.match(shared, /sec-fetch-site/);
  assert.match(createRoute, /invalid_origin/);
  assert.match(joinRoute, /invalid_origin/);
  assert.equal((updateRoute.match(/invalid_origin/g) ?? []).length, 2);
  assert.match(signalRoute, /invalid_origin/);
});

test("peer identities cannot be reassigned to another account", () => {
  const store = read("lib/watch-together/store.ts");
  assert.match(store, /existing\.rows\[0\]\.user_id !== input\.userId/);
  assert.match(store, /WHERE fan_watch_room_members\.user_id = EXCLUDED\.user_id/);
  assert.doesNotMatch(store, /\n\s*user_id\s*=\s*EXCLUDED\.user_id/);
});

test("the player exposes real WebRTC with short-lived signaling and server fallback", () => {
  const bridge = read("components/watch/WatchTogetherBridge.tsx");
  const player = read("components/watch/PersistentPlayer.tsx");
  const provider = read("components/providers/PlayerProvider.tsx");
  assert.match(bridge, /new RTCPeerConnection/);
  assert.match(bridge, /createDataChannel\("core-room-sync"/);
  assert.match(bridge, /SERVER_POLL_INTERVAL_MS = 2_000/);
  assert.match(bridge, /scope: "host" \| "queue"/);
  assert.match(bridge, /Secure server sync/);
  assert.match(player, /WATCH_PLAYBACK_STATE_EVENT/);
  assert.match(player, /WATCH_PLAYBACK_CONTROL_EVENT/);
  assert.match(provider, /replaceQueue: \(items: Playable\[\]\) => void/);
});
