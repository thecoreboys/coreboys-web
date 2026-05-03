import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  status: z.enum(["pending", "approved", "denied"]),
  denialReason: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  await query(
    `UPDATE fan_submissions SET
        status = $2,
        denial_reason = $3,
        approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END,
        reviewed_by_email = $4,
        updated_at = NOW()
     WHERE id = $1`,
    [id, body.status, body.denialReason ?? null, auth.email],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await query("DELETE FROM fan_submissions WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
