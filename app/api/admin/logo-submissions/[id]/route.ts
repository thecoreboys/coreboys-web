import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { ensureLogoSubmissionSchema, safeFileName } from "@/lib/logo-submissions";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
const Body = z.object({
  status: z.enum(["pending", "approved", "denied"]).optional(),
  denialReason: z.string().trim().max(500).nullable().optional(),
  publicName: z.string().trim().min(2).max(70).optional(),
  designName: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().min(20).max(2500).optional(),
  files: z.array(z.object({ id: z.string().uuid(), publicEnabled: z.boolean(), fileName: z.string().trim().min(1).max(120), role: z.enum(["wordmark", "icon", "additional"]) })).max(20).optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  const id = z.string().uuid().safeParse((await params).id); const body = Body.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  if (body.data.status === "denied" && !body.data.denialReason?.trim()) return NextResponse.json({ error: "Add a short reason before denying this design." }, { status: 400 });
  await ensureLogoSubmissionSchema();
  const changed = await withTransaction(async (db) => {
    const existing = await db.query<{ id: string }>(`SELECT id::text FROM logo_submissions WHERE id=$1 FOR UPDATE`, [id.data]); if (!existing.rows[0]) return false;
    await db.query(`UPDATE logo_submissions SET public_name=COALESCE($2,public_name),design_name=COALESCE($3,design_name),description=COALESCE($4,description),status=COALESCE($5,status),denial_reason=CASE WHEN $5='denied' THEN $6 WHEN $5 IN ('approved','pending') THEN NULL ELSE denial_reason END,reviewed_by_email=CASE WHEN $5 IS NULL THEN reviewed_by_email ELSE $7 END,reviewed_at=CASE WHEN $5 IS NULL THEN reviewed_at ELSE now() END,updated_at=now() WHERE id=$1`, [id.data, body.data.publicName ?? null, body.data.designName ?? null, body.data.description ?? null, body.data.status ?? null, body.data.denialReason ?? null, auth.email]);
    for (const file of body.data.files ?? []) await db.query(`UPDATE logo_submission_files SET public_enabled=$3,file_name=$4,file_role=$5 WHERE id=$1 AND submission_id=$2`, [file.id, id.data, file.publicEnabled, safeFileName(file.fileName), file.role]);
    return true;
  });
  return changed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
