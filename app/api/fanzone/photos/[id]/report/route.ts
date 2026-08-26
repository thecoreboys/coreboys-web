import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { ensureFanzoneSchema } from "@/lib/fanzone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  reason: z.enum(["privacy", "copyright", "unsafe", "spam", "other"]),
  details: z.string().trim().max(500).optional().default(""),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid report" }, { status: 400 });
  await ensureFanzoneSchema();
  const insert = await query(
    `INSERT INTO fan_photo_reports (submission_id, user_id, reason, details)
     SELECT id, $2, $3, $4 FROM fan_submissions
      WHERE id = $1 AND status = 'approved'
     ON CONFLICT (submission_id, user_id) DO UPDATE
       SET reason = EXCLUDED.reason, details = EXCLUDED.details,
           status = 'open', created_at = now(), resolved_at = NULL, resolved_by = NULL`,
    [id.data, userId, parsed.data.reason, parsed.data.details || null],
  );
  if ((insert.rowCount ?? 0) === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
