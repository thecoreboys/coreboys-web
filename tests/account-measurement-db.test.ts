import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPool, query } from "../lib/db";
import { accountWatchAnalytics } from "../lib/watch/analytics";
import { listProgress, upsertProgress } from "../lib/watch/progress";
import { deleteConnection, getConnection, listConnections, markSynced, readAccessToken, readRefreshToken, updateTokens, upsertConnection } from "../lib/oauth/connections";
import { listLoyalty, setLoyalty } from "../lib/oauth/loyalty";
import { ensureFanOauthSchema } from "../lib/oauth/schema";

test("local database: isolated watch measurement and OAuth grant lifecycle", {
  skip: process.env.CORE_LOCAL_ACCOUNT_DB_TESTS !== "1",
}, async () => {
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname), "Local database required");
  const userId = randomUUID();
  const secondUserId = randomUUID();
  try {
    await ensureFanOauthSchema();
    for (const id of [userId, secondUserId]) {
      await query(`INSERT INTO fan_users(id,email,password_hash,display_name,consent,consent_at)
        VALUES($1,$2,'not-a-login-password','Measurement test',true,now())`, [id, `${id}@example.invalid`]);
    }
    const baseline = { userId, ref: "youtube:measurement-fixture", kind: "youtube", platform: "youtube", subject: "core", event: "tick" as const, sessionId: "measurement-test-tab", positionSeconds: 100, seconds: 0 };
    assert.equal((await upsertProgress(baseline)).creditedSeconds, 0);
    const observedAt = new Date().toISOString();
    await query(`UPDATE fan_watch_measurement_cursors SET observed_at=$2::timestamptz-interval '15 seconds',received_at=$2::timestamptz-interval '15 seconds' WHERE user_id=$1`, [userId, observedAt]);
    const tick = { ...baseline, positionSeconds: 107.5, seconds: 15, playbackRate: 0.5, observedAt };
    assert.equal((await upsertProgress(tick)).creditedSeconds, 15);
    assert.equal((await upsertProgress(tick)).creditedSeconds, 0, "lost-response retry must be idempotent");
    assert.equal((await upsertProgress({ ...tick, userId: secondUserId })).creditedSeconds, 0, "another account starts at zero");
    const analytics = await accountWatchAnalytics(userId);
    assert.equal(analytics.totalSeconds, 15);
    assert.equal(analytics.seconds7d, 15);
    assert.deepEqual(analytics.byPlatform, [{ platform: "youtube", totalSeconds: 15, seconds7d: 15 }]);
    assert.equal((await accountWatchAnalytics(secondUserId)).totalSeconds, 0);
    assert.equal((await listProgress(userId))[0]!.seconds, 15);
    await upsertProgress({ ...baseline, event: "mark_watched", positionSeconds: 900, durationSeconds: 900 });
    assert.equal((await accountWatchAnalytics(userId)).totalSeconds, 15, "manual completion never changes measured time");
    assert.equal((await listProgress(userId))[0]!.completionSource, "manual");
    await upsertProgress({ ...baseline, progress: 1, positionSeconds: 0, durationSeconds: 900, seconds: 0 });
    assert.equal((await listProgress(userId))[0]!.completionSource, "manual", "inherited progress from manual completion is not playback evidence");
    await upsertProgress({ ...baseline, progress: 1, positionSeconds: 900, durationSeconds: 900, seconds: 0 });
    assert.equal((await listProgress(userId))[0]!.completionSource, "manual", "a zero-second seek to the end is not playback completion");
    await upsertProgress({ ...baseline, event: "complete", positionSeconds: 900, durationSeconds: 900 });
    assert.equal((await listProgress(userId))[0]!.completionSource, "manual", "ended events need enough measured watch time");

    const grant = { userId, provider: "twitch" as const, providerUserId: `fixture-${userId}`, providerUsername: "test-viewer", scopes: ["user:read:follows"], accessToken: "fixture-access-a", refreshToken: "fixture-refresh-a" };
    await upsertConnection(grant);
    const first = (await getConnection(userId, "twitch"))!;
    await setLoyalty({ userId, connectionId: first.id, platform: "twitch", subject: "core", kind: "follow", value: true });
    await markSynced(userId, "twitch", first.id);
    assert.equal((await listLoyalty(userId)).length, 1);
    assert.equal((await listConnections(secondUserId)).length, 0);

    await upsertConnection({ ...grant, providerUserId: `replacement-${userId}`, accessToken: "fixture-access-b", refreshToken: null });
    const replacement = (await getConnection(userId, "twitch"))!;
    assert.notEqual(replacement.id, first.id);
    assert.equal(readRefreshToken(replacement), null, "changing platform identity cannot retain the former identity's refresh token");
    assert.equal((await listLoyalty(userId)).length, 0);
    await updateTokens(userId, "twitch", "stale-refresh-result", null, 3600, first.id);
    await markSynced(userId, "twitch", first.id);
    assert.equal(readAccessToken((await getConnection(userId, "twitch"))!), "fixture-access-b");
    assert.equal((await getConnection(userId, "twitch"))!.last_sync_at, null);
    await assert.rejects(setLoyalty({ userId, connectionId: first.id, platform: "twitch", subject: "core", kind: "follow", value: true }), /Connection changed/);
    await deleteConnection(userId, "twitch", first.id);
    assert.ok(await getConnection(userId, "twitch"), "an old callback cannot disconnect a replacement grant");
    await setLoyalty({ userId, connectionId: replacement.id, platform: "twitch", subject: "core", kind: "follow", value: true });
    await deleteConnection(userId, "twitch", replacement.id);
    assert.equal(await getConnection(userId, "twitch"), null);
    assert.equal((await listLoyalty(userId)).length, 0);
    await assert.rejects(setLoyalty({ userId, connectionId: replacement.id, platform: "twitch", subject: "core", kind: "follow", value: true }), /Connection changed/);
  } finally {
    await query(`DELETE FROM fan_users WHERE id=ANY($1::text[])`, [[userId, secondUserId]]);
    await getPool().end();
    global.__pgPool = undefined;
  }
});
