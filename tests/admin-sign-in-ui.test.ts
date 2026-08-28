import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSignIn = readFileSync(new URL("../app/admin/sign-in/page.tsx", import.meta.url), "utf8");

test("administrator sign-in uses the shared account-style split layout", () => {
  assert.match(adminSignIn, /function AdminAuthShell/);
  assert.match(adminSignIn, /sm:max-w-5xl sm:grid-cols-/);
  assert.match(adminSignIn, /Administrator sign in\./);
  assert.match(adminSignIn, /Sign in<\/Button>/);
});

test("administrator sign-in omits the old staff and member-manager explanation", () => {
  assert.doesNotMatch(adminSignIn, /Admins require an authenticator code/);
  assert.doesNotMatch(adminSignIn, /Member managers open their assigned Studio/);
});
