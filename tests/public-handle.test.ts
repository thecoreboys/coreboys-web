import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicHandle } from "../lib/public-handle";

test("public handles normalize and accept safe unique-format values", () => {
  assert.deepEqual(validatePublicHandle("@Core-Fan01"), { ok: true, handle: "core-fan01" });
});

test("public handles reject reserved, abusive, and malformed values", () => {
  assert.equal(validatePublicHandle("admin").ok, false);
  assert.equal(validatePublicHandle("nazi-fan").ok, false);
  assert.equal(validatePublicHandle("two words").ok, false);
  assert.equal(validatePublicHandle("a").ok, false);
});
