import assert from "node:assert/strict";
import test from "node:test";
import { audioFadeProgress } from "../lib/radio/fade";

test("an earlier frame timestamp cannot fade into an illegal media volume", () => {
  for (const [start, target] of [[0, 0.72], [0.72, 0], [1, 0.22]]) {
    for (const now of [900, 999, 1_000, 1_050, 1_200, 10_000]) {
      const volume = start! + (target! - start!) * audioFadeProgress(now, 1_000, 180);
      assert.ok(volume >= 0 && volume <= 1, `invalid volume ${volume} at ${now}`);
    }
  }
  assert.equal(audioFadeProgress(999, 1_000, 180), 0);
  assert.equal(audioFadeProgress(1_090, 1_000, 180), 0.5);
  assert.equal(audioFadeProgress(1_500, 1_000, 180), 1);
});

test("instant fades finish immediately and invalid timestamps cannot set NaN volume", () => {
  assert.equal(audioFadeProgress(999, 1_000, 0), 1);
  assert.equal(audioFadeProgress(NaN, 1_000, 180), 0);
});
