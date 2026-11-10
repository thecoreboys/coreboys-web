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
