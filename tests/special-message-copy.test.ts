import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/special-message/page.tsx", import.meta.url), "utf8");

test("the personal message uses direct, human copy", () => {
  assert.doesNotMatch(page, /[\u2013\u2014]/);
  assert.doesNotMatch(page, /\bAI\b/);
  assert.doesNotMatch(page, /contribute something meaningful/i);
});
