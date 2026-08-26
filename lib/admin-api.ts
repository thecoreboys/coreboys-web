/** Server-side staff authentication and authorization. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { MEMBERS } from "@/lib/members";
import {
  isStaffRole,
  staffAssignmentIsValid,
  type StaffIdentity,
} from "@/lib/staff-policy";

const MEMBER_SLUGS = new Set(MEMBERS.map((member) => member.slug));

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  member_slug: string | null;
  session_version: number;
  totp_enabled: boolean;
};

/**
 * Resolve the signed JWT back to the live database row on every protected
 * request. The token proves who signed in; the row remains authoritative for
 * role, member assignment, and deactivation so access changes are immediate.
 */
export async function getCurrentStaff(): Promise<StaffIdentity | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const result = await query<StaffRow>(
    `SELECT id::text, email, display_name, role, member_slug,
            session_version, totp_enabled
       FROM admin_users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
      LIMIT 1`,
    [session.email],
  );
  const row = result.rows[0];
  if (!row || !isStaffRole(row.role)) return null;
  if (session.sv !== row.session_version) return null;
  if (row.role === "admin" && (!row.totp_enabled || !session.mfa)) return null;
  if (!staffAssignmentIsValid(row.role, row.member_slug, MEMBER_SLUGS)) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    memberSlug: row.member_slug,
  };
}

type StaffResult =
  | ({ ok: true } & StaffIdentity)
  | { ok: false; response: NextResponse };

export async function requireStaff(): Promise<StaffResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, ...staff };
}

export async function requireAdmin(): Promise<StaffResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff;
  if (staff.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return staff;
}
