import assert from "node:assert/strict";
import test from "node:test";
import { ageFromIso } from "../lib/utils";

test("birthdays stay calendar dates instead of shifting through UTC", () => {
  assert.equal(ageFromIso("2000-08-20", new Date(2026, 7, 19, 23, 59)), 25);
  assert.equal(ageFromIso("2000-08-20", new Date(2026, 7, 20, 0, 1)), 26);
});

test("invalid plain dates are rejected", () => {
  assert.equal(ageFromIso("2001-02-29", new Date(2026, 7, 20)), null);
  assert.equal(ageFromIso("not-a-date", new Date(2026, 7, 20)), null);
});
