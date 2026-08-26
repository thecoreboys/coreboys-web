import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { ensureFanzoneSchema } from "@/lib/fanzone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  await ensureFanzoneSchema();
  const photo = await query(
    `SELECT 1 FROM fan_submissions WHERE id = $1 AND status = 'approved'`,
    [parsed.data],
  );
  if (photo.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  const removed = await query(
    `DELETE FROM fan_photo_reactions WHERE submission_id = $1 AND user_id = $2`,
    [parsed.data, userId],
  );
  let reacted = false;
  if ((removed.rowCount ?? 0) === 0) {
    await query(
      `INSERT INTO fan_photo_reactions (submission_id, user_id, reaction)
       VALUES ($1, $2, 'core') ON CONFLICT DO NOTHING`,
      [parsed.data, userId],
    );
    reacted = true;
  }
  const count = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM fan_photo_reactions WHERE submission_id = $1`,
    [parsed.data],
  );
  return NextResponse.json({ reacted, reactions: Number(count.rows[0]?.count ?? 0) });
}
