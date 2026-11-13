import assert from "node:assert/strict";
import test from "node:test";
import { createGuideSourceCache, guideSourceWithDeadline } from "../lib/watch/guide-source-deadline";

test("a stalled optional source releases the guide with an explicit fallback", async () => {
  const fallback = { items: [], state: "error" };
  const started = Date.now();
  const result = await guideSourceWithDeadline(new Promise<typeof fallback>(() => {}), fallback, 20);
  assert.deepEqual(result, fallback);
  assert.ok(Date.now() - started < 1000);
});

test("successful and failed sources retain their correct status", async () => {
  assert.equal(await guideSourceWithDeadline(Promise.resolve("ok"), "error", 100), "ok");
  assert.equal(await guideSourceWithDeadline(Promise.reject(new Error("offline")), "error", 100), "error");
});

test("a slow refresh keeps the last successful schedule and later picks up the result", async () => {
  const source = createGuideSourceCache<{ state: string; items: number[] }>(0);
  const fallback = { state: "error", items: [] };
  assert.deepEqual(await source(async () => ({ state: "ok", items: [1] }), fallback, 100), { state: "ok", items: [1] });
  let finish!: (value: { state: string; items: number[] }) => void;
  const slow = new Promise<{ state: string; items: number[] }>((resolve) => { finish = resolve; });
  assert.deepEqual(await source(() => slow, fallback, 5), { state: "ok", items: [1] });
  finish({ state: "ok", items: [2] });
  await slow;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(await source(() => new Promise(() => {}), fallback, 5), { state: "ok", items: [2] });
});

test("a cold source reports loading at the response deadline and reuses the in-flight result", async () => {
  type Snapshot = { state: string; items: number[] };
  const source = createGuideSourceCache<Snapshot>(60_000);
  const failure: Snapshot = { state: "error", items: [] };
  const loading: Snapshot = { state: "loading", items: [] };
  let finish!: (value: Snapshot) => void;
  let calls = 0;
  const work = new Promise<Snapshot>((resolve) => { finish = resolve; });
  const load = () => { calls += 1; return work; };
  const [first, concurrent] = await Promise.all([
    source(load, failure, 5, loading), source(load, failure, 5, loading),
  ]);
  assert.deepEqual(first, loading);
  assert.deepEqual(concurrent, loading);
  assert.equal(calls, 1, "the response deadline must not restart the provider");
  finish({ state: "ok", items: [42] });
  await work;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(await source(load, failure, 5, loading), { state: "ok", items: [42] });
  assert.equal(calls, 1);
});

test("real source failures remain errors and cannot replace the saved schedule", async () => {
  const source = createGuideSourceCache<{ state: string; items: number[] }>(0);
  const fallback = { state: "error", items: [] };
  const loading = { state: "loading", items: [] };
  assert.deepEqual(await source(async () => { throw new Error("offline"); }, fallback, 100, loading), fallback);
  assert.deepEqual(await source(async () => ({ state: "ok", items: [7] }), fallback, 100, loading), { state: "ok", items: [7] });
  assert.deepEqual(await source(async () => { throw new Error("offline"); }, fallback, 100, loading), { state: "ok", items: [7] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(await source(async () => { throw new Error("still offline"); }, fallback, 100, loading), { state: "ok", items: [7] });
});

test("a provider that keeps failing slower than the deadline reports an error, not loading forever", async () => {
  type Snapshot = { state: string; items: number[] };
  const source = createGuideSourceCache<Snapshot>(60_000);
  const failure: Snapshot = { state: "error", items: [] };
  const loading: Snapshot = { state: "loading", items: [] };
  const slowFailure = () => new Promise<Snapshot>((_, reject) => setTimeout(() => reject(new Error("quota")), 15));
  // Cold: nothing has answered yet, so the deadline honestly reports loading.
  assert.deepEqual(await source(slowFailure, failure, 5, loading), loading);
  await new Promise((resolve) => setTimeout(resolve, 25));
  // The retry is just as slow, but the source is now known to be failing.
  assert.deepEqual(await source(slowFailure, failure, 5, loading), failure);
  await new Promise((resolve) => setTimeout(resolve, 25));
  // A recovery is picked up as soon as it answers.
  assert.deepEqual(await source(async () => ({ state: "ok", items: [3] }), failure, 50, loading), { state: "ok", items: [3] });
});
