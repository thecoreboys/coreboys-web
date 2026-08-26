import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node type stripping requires the explicit suffix.
import { contentFingerprint, stableJson } from "../lib/media-intelligence/fingerprint.ts";
// @ts-expect-error Node type stripping requires the explicit suffix.
import { editDistance, tokenFuzzySimilarity } from "../lib/media-intelligence/text.ts";

test("revision fingerprints are stable across object key order", () => {
  const left = { title: "20 Women vs 1", member: "JShock", nested: { b: 2, a: 1 } };
  const right = { nested: { a: 1, b: 2 }, member: "JShock", title: "20 Women vs 1" };
  assert.equal(stableJson(left), stableJson(right));
  assert.equal(contentFingerprint(left), contentFingerprint(right));
});

test("local fuzzy matching tolerates misspellings", () => {
  assert.equal(editDistance("jshok", "jshock"), 1);
  assert.ok(tokenFuzzySimilarity("jshok edat", "jshock edate 20 girls") > 0.75);
});
