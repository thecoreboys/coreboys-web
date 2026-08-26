import { z } from "zod";
import { MEMBERS } from "@/lib/members";
import { STAFF_ROLES, type StaffRole } from "@/lib/staff-policy";

export const MEMBER_SLUGS = new Set(MEMBERS.map((member) => member.slug));

const Email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const Password = z.string().min(12, "Password must be at least 12 characters.").max(200);
const DisplayName = z.string().trim().min(1).max(80);
const MemberSlug = z.enum(MEMBERS.map((member) => member.slug) as [string, ...string[]]);

function validateScope(
  value: { role?: StaffRole; memberSlug?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.role === "admin" && value.memberSlug != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["memberSlug"], message: "Admins cannot be assigned to one member." });
  }
  if (value.role === "member_manager" && !value.memberSlug) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["memberSlug"], message: "Member managers require a member." });
  }
}

export const CreateStaffAccount = z.object({
  email: Email,
  password: Password,
  displayName: DisplayName,
  role: z.enum(STAFF_ROLES),
  memberSlug: MemberSlug.nullable().optional(),
}).superRefine(validateScope);

export const UpdateStaffAccount = z.object({
  email: Email.optional(),
  password: Password.optional(),
  displayName: DisplayName.optional(),
  role: z.enum(STAFF_ROLES).optional(),
  memberSlug: MemberSlug.nullable().optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied.");
