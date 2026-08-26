import "server-only";

import { withTransaction } from "@/lib/db";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import {
  staffAssignmentIsValid,
  type StaffIdentity,
  type StaffRole,
} from "@/lib/staff-policy";

export type StaffAccountRow = {
  id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  member_slug: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  totp_enabled: boolean;
};

type StoredStaffAccount = StaffAccountRow & { password_hash: string };

export type StaffAccountPatch = {
  email?: string;
  displayName?: string;
  role?: StaffRole;
  memberSlug?: string | null;
  active?: boolean;
  passwordHash?: string;
};

export class StaffAccountMutationError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_assignment"
      | "self_lockout"
      | "last_admin",
  ) {
    super(code);
    this.name = "StaffAccountMutationError";
  }
}

export async function mutateStaffAccount(
  id: string,
  actor: StaffIdentity,
  patch: StaffAccountPatch,
): Promise<StaffAccountRow> {
  return withTransaction(async (client) => {
    // Serializes account removals so two concurrent requests cannot both
    // observe another admin and deactivate the final two at once.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('coreboys-staff-admin-guard'))",
    );

    const currentResult = await client.query<StoredStaffAccount>(
      `SELECT id::text, email, display_name, role, member_slug,
              password_hash, totp_enabled, created_at::text, updated_at::text,
              deleted_at::text
         FROM admin_users
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) throw new StaffAccountMutationError("not_found");

    const nextRole = patch.role ?? current.role;
    const nextMemberSlug = patch.memberSlug !== undefined
      ? patch.memberSlug
      : current.member_slug;
    const nextActive = patch.active ?? current.deleted_at === null;

    if (!staffAssignmentIsValid(nextRole, nextMemberSlug, MEMBER_SLUGS)) {
      throw new StaffAccountMutationError("invalid_assignment");
    }

    const removesAdmin =
      current.role === "admin" &&
      current.deleted_at === null &&
      (nextRole !== "admin" || !nextActive);
    if (actor.id === current.id && removesAdmin) {
      throw new StaffAccountMutationError("self_lockout");
    }
    if (removesAdmin) {
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM admin_users
          WHERE role = 'admin'
            AND deleted_at IS NULL
            AND id <> $1`,
        [current.id],
      );
      if (Number(countResult.rows[0]?.count ?? 0) < 1) {
        throw new StaffAccountMutationError("last_admin");
      }
    }

    const updated = await client.query<StaffAccountRow>(
      `UPDATE admin_users
          SET email = $2,
              display_name = $3,
              role = $4,
              roles = $4,
              member_slug = $5,
              password_hash = COALESCE($6, password_hash),
              deleted_at = CASE
                WHEN $7::boolean IS NULL THEN deleted_at
                WHEN $7 THEN NULL
                ELSE now()
              END,
              session_version = session_version + CASE WHEN $6::text IS NOT NULL OR $4 IS DISTINCT FROM role OR $2 IS DISTINCT FROM email OR $7::boolean IS NOT NULL THEN 1 ELSE 0 END,
              updated_at = now()
        WHERE id = $1
      RETURNING id::text, email, display_name, role, member_slug, totp_enabled,
                created_at::text, updated_at::text, deleted_at::text`,
      [
        current.id,
        patch.email ?? current.email,
        patch.displayName ?? current.display_name,
        nextRole,
        nextMemberSlug,
        patch.passwordHash ?? null,
        patch.active ?? null,
      ],
    );
    return updated.rows[0]!;
  });
}
