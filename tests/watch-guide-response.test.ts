import assert from "node:assert/strict";
import test from "node:test";
import { fetchWatchGuide, WATCH_GUIDE_KEY } from "../lib/watch/guide-response";

test("guide fetching preserves a valid snapshot and bounds stalled requests", async (context) => {
  const snapshot = { programs: [], networks: [], serverNow: "2026-11-08T12:00:00Z" };
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, WATCH_GUIDE_KEY);
    assert.equal(init.credentials, "same-origin");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(snapshot);
  });
  assert.deepEqual(await fetchWatchGuide(WATCH_GUIDE_KEY), snapshot);
});

test("failed guide responses reject so SWR retains the previous good snapshot", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ programs: [] }, { status: 503 }));
  await assert.rejects(fetchWatchGuide(WATCH_GUIDE_KEY), /Guide unavailable \(503\)/);
});

test("malformed successful guide responses cannot replace cached programs", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ error: "unavailable" }));
  await assert.rejects(fetchWatchGuide(WATCH_GUIDE_KEY), /invalid response/);
});
