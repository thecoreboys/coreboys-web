import assert from "node:assert/strict";
import test from "node:test";
import { createWatchRefreshScheduler } from "../lib/watch/refresh-scheduler";

function harness() {
  let time = 0;
  let active = true;
  let refreshes = 0;
  type Timer = ReturnType<typeof setTimeout>;
  const tasks = new Map<Timer, { at: number; run: () => void }>();
  const scheduler = createWatchRefreshScheduler({
    refresh: () => { refreshes += 1; },
    isActive: () => active,
    now: () => time,
    schedule: (run, delay) => {
      const timer = {} as Timer;
      tasks.set(timer, { at: time + delay, run });
      return timer;
    },
    cancel: (timer) => { tasks.delete(timer); },
  });
  return {
    ...scheduler,
    get refreshes() { return refreshes; },
    get pendingTimers() { return tasks.size; },
    setActive(value: boolean) { active = value; },
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        const next = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at;
        tasks.delete(next[0]);
        next[1].run();
      }
      time = end;
    },
  };
}

test("focus, visibility, and catalog polling share one refresh per minute", () => {
  const scheduler = harness();
  scheduler.request("catalog");
  scheduler.request("catalog");
  scheduler.advance(10_000);
  scheduler.request("catalog");
  assert.equal(scheduler.pendingTimers, 1);
  scheduler.advance(49_999);
  assert.equal(scheduler.refreshes, 0);
  scheduler.advance(1);
  assert.equal(scheduler.refreshes, 1);
  scheduler.request("catalog");
  scheduler.advance(60_000);
  assert.equal(scheduler.refreshes, 2);
});

test("live transitions promote pending catalog work and coalesce both providers", () => {
  const scheduler = harness();
  scheduler.request("catalog");
  scheduler.advance(1_000);
  scheduler.request("live");
  scheduler.request("live");
  scheduler.request("catalog");
  assert.equal(scheduler.pendingTimers, 1);
  scheduler.advance(500);
  assert.equal(scheduler.refreshes, 1);
  scheduler.advance(58_500);
  assert.equal(scheduler.refreshes, 1, "the replaced minute timer must not also fire");
});

test("a second live transition is bounded without losing the update", () => {
  const scheduler = harness();
  scheduler.request("live");
  scheduler.advance(500);
  scheduler.request("live");
  scheduler.advance(1_999);
  assert.equal(scheduler.refreshes, 1);
  scheduler.advance(1);
  assert.equal(scheduler.refreshes, 2);
});

test("hidden or offline work waits and resumes urgent state on the next active event", () => {
  const scheduler = harness();
  scheduler.request("live");
  scheduler.setActive(false);
  scheduler.advance(500);
  assert.equal(scheduler.refreshes, 0);
  assert.equal(scheduler.pendingTimers, 0);
  scheduler.setActive(true);
  scheduler.request("catalog");
  scheduler.advance(500);
  assert.equal(scheduler.refreshes, 1, "a retained live change should not wait for the minute cooldown");
});

test("unmount cancels route work and the scheduler supports React effect replay", () => {
  const scheduler = harness();
  scheduler.request("live");
  scheduler.cancel();
  scheduler.advance(60_000);
  assert.equal(scheduler.refreshes, 0);
  assert.equal(scheduler.pendingTimers, 0);
  scheduler.request("live");
  scheduler.advance(500);
  assert.equal(scheduler.refreshes, 1);
});
