import assert from "node:assert/strict";
import test from "node:test";
import { guideSourceWithDeadline } from "../lib/watch/guide-source-deadline";

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
