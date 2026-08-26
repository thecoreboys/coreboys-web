export const STAFF_ROLES = ["admin", "member_manager"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
  memberSlug: string | null;
};

export function isStaffRole(value: unknown): value is StaffRole {
  return value === "admin" || value === "member_manager";
}

export function isKnownMemberSlug(
  value: string | null | undefined,
  knownSlugs: ReadonlySet<string>,
): value is string {
  return typeof value === "string" && knownSlugs.has(value);
}

export function staffAssignmentIsValid(
  role: StaffRole,
  memberSlug: string | null,
  knownSlugs: ReadonlySet<string>,
): boolean {
  return role === "admin"
    ? memberSlug === null
    : isKnownMemberSlug(memberSlug, knownSlugs);
}

function safeLocalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "https://thecoreboys.invalid");
    if (url.origin !== "https://thecoreboys.invalid") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function staffLandingPath(role: StaffRole, requested?: string | null): string {
  const next = safeLocalPath(requested);
  if (role === "admin") {
    if (next?.startsWith("/admin") || next?.startsWith("/studio")) return next;
    return "/admin";
  }
  return next?.startsWith("/studio") ? next : "/studio";
}

export function staffMemberScope(
  staff: Pick<StaffIdentity, "role" | "memberSlug">,
  requested: string | null | undefined,
  knownSlugs: ReadonlySet<string>,
): string | null {
  if (staff.role === "member_manager") {
    return isKnownMemberSlug(staff.memberSlug, knownSlugs) &&
      (!requested || requested === staff.memberSlug)
      ? staff.memberSlug
      : null;
  }
  return isKnownMemberSlug(requested, knownSlugs) ? requested : null;
}
