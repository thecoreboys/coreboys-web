import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { resetAdminTotp } from "@/lib/admin-totp";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Id = z.string().uuid();

/** An elevated, TOTP-verified admin can force a new enrollment after device loss. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const id = Id.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "invalid account id" }, { status: 400 });
  const row = await query<{ role: string }>(`SELECT role FROM admin_users WHERE id = $1 AND deleted_at IS NULL`, [id.data]);
  if (!row.rows[0]) return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
  if (row.rows[0].role !== "admin") return NextResponse.json({ error: "Only elevated admin accounts use TOTP." }, { status: 400 });
  await resetAdminTotp(id.data);
  return NextResponse.json({ ok: true });
}
