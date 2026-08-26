import assert from "node:assert/strict";
import test from "node:test";
import {
  canPostcardStaffAction,
  decidePostcardStaffAction,
  resolvePostcardStaffMemberScope,
} from "../lib/postcard-permissions";

const members = new Set(["ron", "jason", "lacy", "marlon", "adapt"]);
const admin = { role: "admin" as const, memberSlug: null };
const jasonManager = { role: "member_manager" as const, memberSlug: "jason" };

test("member managers inherit only their authoritative postcard scope", () => {
  assert.equal(resolvePostcardStaffMemberScope(jasonManager, undefined, members), "jason");
  assert.equal(resolvePostcardStaffMemberScope(jasonManager, "jason", members), "jason");
  assert.equal(resolvePostcardStaffMemberScope(jasonManager, "lacy", members), null);
  assert.equal(resolvePostcardStaffMemberScope(admin, "lacy", members), "lacy");
  assert.equal(resolvePostcardStaffMemberScope(admin, undefined, members), null);
});

test("member managers can manage drafts, drops, inbox, reactions, and scoped analytics", () => {
  for (const action of [
    "pack.create",
    "pack.update",
    "pack.submit",
    "asset.upload",
    "drop.schedule",
    "drop.cancel",
    "inbox.read",
    "acknowledgement.write",
    "analytics.read",
  ] as const) {
    assert.equal(canPostcardStaffAction(jasonManager, action, "jason", members), true, action);
    assert.equal(canPostcardStaffAction(jasonManager, action, "lacy", members), false, action);
  }
});

test("approval, publication, moderation, refunds, and global data remain admin-only", () => {
  for (const action of [
    "pack.review",
    "pack.publish",
    "pack.retire",
    "asset.review",
    "asset.retire",
  ] as const) {
    assert.deepEqual(
      decidePostcardStaffAction(jasonManager, action, "jason", members),
      { allowed: false, memberSlug: null, reason: "admin_required" },
    );
    assert.equal(canPostcardStaffAction(admin, action, "jason", members), true);
  }

  for (const action of [
    "analytics.read_global",
    "audit.read_global",
    "order.moderate",
    "order.refund",
  ] as const) {
    assert.equal(canPostcardStaffAction(jasonManager, action, "jason", members), false);
    assert.deepEqual(
      decidePostcardStaffAction(admin, action, null, members),
      { allowed: true, memberSlug: null },
    );
  }
});

test("unknown or malformed staff assignments never receive postcard access", () => {
  assert.deepEqual(
    decidePostcardStaffAction(jasonManager, "pack.read", "unknown", members),
    { allowed: false, memberSlug: null, reason: "cross_member_scope" },
  );
  assert.deepEqual(
    decidePostcardStaffAction(
      { role: "member_manager", memberSlug: null },
      "pack.read",
      "jason",
      members,
    ),
    { allowed: false, memberSlug: null, reason: "invalid_staff_assignment" },
  );
  assert.deepEqual(
    decidePostcardStaffAction(
      { role: "admin", memberSlug: "jason" },
      "pack.read",
      "jason",
      members,
    ),
    { allowed: false, memberSlug: null, reason: "invalid_staff_assignment" },
  );
});
