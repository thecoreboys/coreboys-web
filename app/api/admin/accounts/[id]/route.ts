import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { UpdateStaffAccount } from "@/lib/staff-accounts";
import {
  mutateStaffAccount,
  StaffAccountMutationError,
  type StaffAccountRow,
} from "@/lib/staff-account-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Id = z.string().uuid();

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

function mutationError(error: unknown): NextResponse | null {
  if (!(error instanceof StaffAccountMutationError)) return null;
  if (error.code === "not_found") {
    return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
  }
  if (error.code === "last_admin") {
    return NextResponse.json({ error: "At least one active admin is required." }, { status: 409 });
  }
  if (error.code === "self_lockout") {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 409 });
  }
  return NextResponse.json({ error: "The role and member assignment do not match." }, { status: 400 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const id = Id.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "invalid account id" }, { status: 400 });

  const parsed = UpdateStaffAccount.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid payload" },
      { status: 400 },
    );
  }

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 12)
    : undefined;
  try {
    const account = await mutateStaffAccount(id.data, auth, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      memberSlug: parsed.data.memberSlug,
      active: parsed.data.active,
      passwordHash,
    });
    return NextResponse.json({ account: publicAccount(account) });
  } catch (error) {
    const response = mutationError(error);
    if (response) return response;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "A staff account with that email already exists." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const id = Id.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "invalid account id" }, { status: 400 });

  try {
    const account = await mutateStaffAccount(id.data, auth, { active: false });
    return NextResponse.json({ account: publicAccount(account) });
  } catch (error) {
    const response = mutationError(error);
    if (response) return response;
    throw error;
  }
}
