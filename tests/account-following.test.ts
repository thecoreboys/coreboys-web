import assert from "node:assert/strict";
import test from "node:test";
import { buildPlatformFollowing } from "../lib/oauth/following";
import type { ConnectionPublic } from "../lib/oauth/connections";
import type { LoyaltyFact } from "../lib/oauth/loyalty";

const now = Date.parse("2026-09-10T12:00:00Z");
const connection: ConnectionPublic = {
  provider: "twitch", username: "viewer", avatarUrl: null, status: "active",
  connectedAt: "2026-09-09T12:00:00Z", lastSyncAt: "2026-09-10T11:59:00Z", lastSyncError: null, scopes: [],
};
const slug = buildPlatformFollowing([connection], [], now)[0]!.members[0]!.slug;
const fact: LoyaltyFact = { platform: "twitch", subject: slug, kind: "follow", value: true, updatedAt: "2026-09-10T11:59:00Z", meta: null };
const status = (conn = connection, facts = [fact]) => buildPlatformFollowing([conn], facts, now)[0]!.members.find((member) => member.slug === slug)!.status;

test("following and non-following require current provider evidence", () => {
  assert.equal(status(), "following");
  assert.equal(status(connection, [{ ...fact, value: false }]), "not_following");
  assert.equal(status(connection, []), "unknown");
  assert.equal(status(connection, [{ ...fact, subject: "someone-else" }]), "unknown");
});

test("sync failures, stale facts, old grants and disconnected accounts never show false unfollows", () => {
  assert.equal(status({ ...connection, lastSyncError: "rate limit" }), "unknown");
  assert.equal(status({ ...connection, status: "expired" }), "unknown");
  assert.equal(status({ ...connection, lastSyncAt: null }), "unknown");
  assert.equal(status(connection, [{ ...fact, updatedAt: "2026-09-08T11:59:00Z" }]), "unknown");
  assert.equal(status({ ...connection, connectedAt: "2026-09-10T12:00:00Z" }), "unknown");
  assert.deepEqual(buildPlatformFollowing([], [fact], now), []);
});

test("YouTube reports subscriptions while TikTok and Instagram report unsupported follow access", () => {
  const youtube = buildPlatformFollowing([{ ...connection, provider: "youtube" }], [{ ...fact, platform: "youtube", kind: "sub" }], now)[0]!;
  const member = youtube.members.find((item) => item.slug === slug)!;
  assert.equal(member.status, "following");
  assert.equal(member.subscribed, true);
  for (const provider of ["tiktok", "instagram"] as const) {
    const result = buildPlatformFollowing([{ ...connection, provider }], [{ ...fact, platform: provider }], now)[0]!;
    assert.ok(result.members.every((item) => item.status === "unsupported" && item.subscribed === null));
  }
});
