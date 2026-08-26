import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { CreateStaffAccount } from "@/lib/staff-accounts";
import type { StaffAccountRow } from "@/lib/staff-account-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicAccount(row: StaffAccountRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    memberSlug: row.member_slug,
    active: row.deleted_at === null,
    twoFactorEnabled: row.totp_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const result = await query<StaffAccountRow>(
    `SELECT id::text, email, display_name, role, member_slug, totp_enabled,
            created_at::text, updated_at::text, deleted_at::text
       FROM admin_users
      ORDER BY deleted_at IS NOT NULL, role, display_name, email`,
  );
  return NextResponse.json({
    accounts: result.rows.map(publicAccount),
    currentStaffId: auth.id,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = CreateStaffAccount.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid payload" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const result = await query<StaffAccountRow>(
      `INSERT INTO admin_users
         (email, password_hash, roles, role, member_slug, display_name,
          updated_at, deleted_at)
       VALUES ($1, $2, $3, $3, $4, $5, now(), NULL)
       RETURNING id::text, email, display_name, role, member_slug, totp_enabled,
                 created_at::text, updated_at::text, deleted_at::text`,
      [
        parsed.data.email,
        passwordHash,
        parsed.data.role,
        parsed.data.role === "admin" ? null : parsed.data.memberSlug,
        parsed.data.displayName,
      ],
    );
    return NextResponse.json({ account: publicAccount(result.rows[0]!) }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "A staff account with that email already exists." }, { status: 409 });
    }
    throw error;
  }
}
