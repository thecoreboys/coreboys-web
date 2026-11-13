import assert from "node:assert/strict";
import test from "node:test";
import { hasSeenIntro, rememberIntro, introCreditVisible, INTRO_SEEN_KEY } from "../lib/first-visit-intro";

test("the welcome intro remembers completed or deliberately skipped visits across sessions", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(hasSeenIntro(storage), false);
  rememberIntro(storage);
  assert.equal(values.get(INTRO_SEEN_KEY), "1");
  assert.equal(hasSeenIntro(storage), true);
  assert.equal(hasSeenIntro({ getItem: (key) => values.get(key) ?? null }), true);
});

test("blocked local storage falls back to an exact first-party cookie", () => {
  const blocked = { getItem: () => { throw new Error("Storage disabled"); }, setItem: () => { throw new Error("Storage disabled"); } };
  assert.doesNotThrow(() => rememberIntro(blocked));
  assert.equal(hasSeenIntro(blocked, "theme=dark; core_welcome_seen=1; consent=necessary"), true);
  assert.equal(hasSeenIntro(null, "not_core_welcome_seen=1"), false);
  assert.equal(hasSeenIntro(null, "core_welcome_seen=10"), false);
  assert.equal(hasSeenIntro(blocked, ""), false);
});

test("the creator credit appears during the last four seconds of the actual video", () => {
  assert.equal(introCreditVisible(41.6, 45.7), false);
  assert.equal(introCreditVisible(41.7, 45.7), true);
  assert.equal(introCreditVisible(45.7, 45.7), true);
  assert.equal(introCreditVisible(0, 0), false);
  assert.equal(introCreditVisible(10, Infinity), false);
});
