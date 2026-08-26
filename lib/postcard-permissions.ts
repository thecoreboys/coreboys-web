import type { StaffIdentity } from "./staff-policy";
import {
  isStaffRole,
  staffAssignmentIsValid,
  staffMemberScope,
} from "./staff-policy";

export const POSTCARD_STAFF_ACTIONS = [
  "pack.read",
  "pack.create",
  "pack.update",
  "pack.submit",
  "pack.review",
  "pack.publish",
  "pack.retire",
  "asset.read",
  "asset.upload",
  "asset.review",
  "asset.retire",
  "drop.read",
  "drop.schedule",
  "drop.cancel",
  "inbox.read",
  "acknowledgement.write",
  "analytics.read",
  "analytics.read_global",
  "audit.read_global",
  "order.moderate",
  "order.refund",
] as const;

export type PostcardStaffAction = (typeof POSTCARD_STAFF_ACTIONS)[number];

type PostcardActionPolicy = {
  scope: "member" | "global";
  adminOnly: boolean;
};

const ACTION_POLICY: Readonly<Record<PostcardStaffAction, PostcardActionPolicy>> = {
  "pack.read": { scope: "member", adminOnly: false },
  "pack.create": { scope: "member", adminOnly: false },
  "pack.update": { scope: "member", adminOnly: false },
  "pack.submit": { scope: "member", adminOnly: false },
  "pack.review": { scope: "member", adminOnly: true },
  "pack.publish": { scope: "member", adminOnly: true },
  "pack.retire": { scope: "member", adminOnly: true },
  "asset.read": { scope: "member", adminOnly: false },
  "asset.upload": { scope: "member", adminOnly: false },
  "asset.review": { scope: "member", adminOnly: true },
  "asset.retire": { scope: "member", adminOnly: true },
  "drop.read": { scope: "member", adminOnly: false },
  "drop.schedule": { scope: "member", adminOnly: false },
  "drop.cancel": { scope: "member", adminOnly: false },
  "inbox.read": { scope: "member", adminOnly: false },
  "acknowledgement.write": { scope: "member", adminOnly: false },
  "analytics.read": { scope: "member", adminOnly: false },
  "analytics.read_global": { scope: "global", adminOnly: true },
  "audit.read_global": { scope: "global", adminOnly: true },
  "order.moderate": { scope: "global", adminOnly: true },
  "order.refund": { scope: "global", adminOnly: true },
};

export type PostcardStaffDecision =
  | { allowed: true; memberSlug: string | null }
  | {
      allowed: false;
      memberSlug: null;
      reason:
        | "invalid_staff_assignment"
        | "admin_required"
        | "member_scope_required"
        | "cross_member_scope";
    };

/**
 * Resolve the only member scope a staff identity may use. Member managers may
 * omit the requested slug, in which case their authoritative assignment is
 * used. Admins must explicitly choose a known member for member-scoped work.
 */
export function resolvePostcardStaffMemberScope(
  staff: Pick<StaffIdentity, "role" | "memberSlug">,
  requestedMemberSlug: string | null | undefined,
  knownMemberSlugs: ReadonlySet<string>,
): string | null {
  if (
    !isStaffRole(staff.role)
    || !staffAssignmentIsValid(staff.role, staff.memberSlug, knownMemberSlugs)
  ) {
    return null;
  }
  return staffMemberScope(staff, requestedMemberSlug, knownMemberSlugs);
}

/** Pure authorization decision; database/API code must still scope its SQL. */
export function decidePostcardStaffAction(
  staff: Pick<StaffIdentity, "role" | "memberSlug">,
  action: PostcardStaffAction,
  requestedMemberSlug: string | null | undefined,
  knownMemberSlugs: ReadonlySet<string>,
): PostcardStaffDecision {
  if (
    !isStaffRole(staff.role)
    || !staffAssignmentIsValid(staff.role, staff.memberSlug, knownMemberSlugs)
  ) {
    return { allowed: false, memberSlug: null, reason: "invalid_staff_assignment" };
  }

  const policy = ACTION_POLICY[action];
  if (policy.scope === "global") {
    return staff.role === "admin"
      ? { allowed: true, memberSlug: null }
      : { allowed: false, memberSlug: null, reason: "admin_required" };
  }

  if (staff.role !== "admin" && policy.adminOnly) {
    return { allowed: false, memberSlug: null, reason: "admin_required" };
  }

  const memberSlug = resolvePostcardStaffMemberScope(
    staff,
    requestedMemberSlug,
    knownMemberSlugs,
  );
  if (memberSlug) return { allowed: true, memberSlug };

  if (
    staff.role === "member_manager"
    && requestedMemberSlug
    && requestedMemberSlug !== staff.memberSlug
  ) {
    return { allowed: false, memberSlug: null, reason: "cross_member_scope" };
  }
  return { allowed: false, memberSlug: null, reason: "member_scope_required" };
}

export function canPostcardStaffAction(
  staff: Pick<StaffIdentity, "role" | "memberSlug">,
  action: PostcardStaffAction,
  requestedMemberSlug: string | null | undefined,
  knownMemberSlugs: ReadonlySet<string>,
): boolean {
  return decidePostcardStaffAction(
    staff,
    action,
    requestedMemberSlug,
    knownMemberSlugs,
  ).allowed;
}
