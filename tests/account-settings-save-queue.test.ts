import assert from "node:assert/strict";
import test from "node:test";
import { createDebouncedWorkspaceSave } from "../lib/account/workspace-save-queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("rapid preference changes persist only the latest snapshot", async () => {
  const writes: number[] = [];
  const queue = createDebouncedWorkspaceSave(async (value: number) => { writes.push(value); }, 10);

  queue.schedule(1);
  queue.schedule(2);
  queue.schedule(3);
  await wait(20);

  assert.deepEqual(writes, [3]);
});

test("a newer preference snapshot waits for an older write to finish", async () => {
  const writes: number[] = [];
  let finishFirst: (() => void) | undefined;
  const queue = createDebouncedWorkspaceSave(async (value: number) => {
    writes.push(value);
    if (value === 1) await new Promise<void>((resolve) => { finishFirst = resolve; });
  }, 0);

  queue.schedule(1);
  const firstWrite = queue.flush();
  await wait(0);
  queue.schedule(2);
  const secondWrite = queue.flush();
  await wait(0);
  assert.deepEqual(writes, [1]);

  finishFirst?.();
  await firstWrite;
  await secondWrite;
  assert.deepEqual(writes, [1, 2]);
});
