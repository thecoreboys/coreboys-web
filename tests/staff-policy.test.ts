import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's type-stripping runner requires the TypeScript suffix.
import { staffAssignmentIsValid, staffLandingPath, staffMemberScope } from "../lib/staff-policy.ts";
// @ts-expect-error Node's type-stripping runner requires the TypeScript suffix.
import { StudioProfilePatch } from "../lib/studio-profile.ts";

const members = new Set(["adapt", "lacy"]);

test("staff assignments require the right member scope", () => {
  assert.equal(staffAssignmentIsValid("admin", null, members), true);
  assert.equal(staffAssignmentIsValid("admin", "adapt", members), false);
  assert.equal(staffAssignmentIsValid("member_manager", "adapt", members), true);
  assert.equal(staffAssignmentIsValid("member_manager", null, members), false);
  assert.equal(staffAssignmentIsValid("member_manager", "unknown", members), false);
});

test("login landing paths stay local and role appropriate", () => {
  assert.equal(staffLandingPath("admin", "/admin/accounts?tab=active"), "/admin/accounts?tab=active");
  assert.equal(staffLandingPath("admin", "https://evil.example/admin"), "/admin");
  assert.equal(staffLandingPath("admin", "//evil.example/admin"), "/admin");
  assert.equal(staffLandingPath("member_manager", "/admin/accounts"), "/studio");
  assert.equal(staffLandingPath("member_manager", "/studio?member=adapt"), "/studio?member=adapt");
});

test("member managers cannot select another Studio scope", () => {
  const manager = { role: "member_manager" as const, memberSlug: "adapt" };
  const admin = { role: "admin" as const, memberSlug: null };
  assert.equal(staffMemberScope(manager, undefined, members), "adapt");
  assert.equal(staffMemberScope(manager, "adapt", members), "adapt");
  assert.equal(staffMemberScope(manager, "lacy", members), null);
  assert.equal(staffMemberScope(admin, "lacy", members), "lacy");
  assert.equal(staffMemberScope(admin, "unknown", members), null);
});

test("Studio profile input accepts only bounded safe fields", () => {
  assert.equal(StudioProfilePatch.safeParse({ nickname: "Unc" }).success, true);
  assert.equal(StudioProfilePatch.safeParse({}).success, false);
  assert.equal(StudioProfilePatch.safeParse({ realName: "Not allowed" }).success, false);
  assert.equal(StudioProfilePatch.safeParse({ bio: "x".repeat(2_001) }).success, false);
});
