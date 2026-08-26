import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import { deletePrivateFanPhoto } from "@/lib/fanzone-storage";
import { queueFanNotification } from "@/lib/fanzone-notifications";
import { awardPointsInTransaction } from "@/lib/points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  status: z.enum(["pending", "approved", "denied"]).optional(),
  denialReason: z.string().trim().max(300).nullable().optional(),
  featured: z.boolean().optional(),
  moderationStatus: z.enum(["unreviewed", "safe", "flagged"]).optional(),
  moderationNotes: z.string().trim().max(1000).nullable().optional(),
  resolveReports: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied.");

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await ensureFanzoneSchema();
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  if (body.status === "denied" && !body.denialReason?.trim()) {
    return NextResponse.json({ error: "A short denial reason is required." }, { status: 400 });
  }
  const previous=await withTransaction(async(client)=>{
    const before = await client.query<{ status: string; user_id: string | null }>(
      `SELECT status,user_id FROM fan_submissions WHERE id=$1 FOR UPDATE`,[id],
    );
    if(!before.rows[0])return null;
    const updated = await client.query(
    `UPDATE fan_submissions SET
        status = COALESCE($2, status),
        denial_reason = CASE
          WHEN $2 = 'denied' THEN $3
          WHEN $2 IN ('approved','pending') THEN NULL
          ELSE denial_reason END,
        approved_at = CASE
          WHEN $2 = 'approved' THEN COALESCE(approved_at, NOW())
          WHEN $2 IN ('pending','denied') THEN NULL
          ELSE approved_at END,
        reviewed_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE reviewed_at END,
        reviewed_by_email = CASE WHEN $2 IS NOT NULL THEN $4 ELSE reviewed_by_email END,
        featured = CASE
          WHEN $2 IN ('pending','denied') THEN false
          ELSE COALESCE($5, featured) END,
        featured_at = CASE
          WHEN $2 IN ('pending','denied') THEN NULL
          WHEN $5 = true THEN COALESCE(featured_at, NOW())
          WHEN $5 = false THEN NULL
          ELSE featured_at END,
        moderation_status = COALESCE($6, moderation_status),
        moderation_notes = CASE WHEN $7::boolean THEN $8 ELSE moderation_notes END,
        updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [
      id,
      body.status ?? null,
      body.denialReason ?? null,
      auth.email,
      body.featured ?? null,
      body.moderationStatus ?? null,
      body.moderationNotes !== undefined,
      body.moderationNotes ?? null,
    ],
    );
    if((updated.rowCount ?? 0)===0)return null;
    if(body.resolveReports){
      await client.query(`UPDATE fan_photo_reports SET status='resolved',resolved_at=now(),resolved_by=$2
        WHERE submission_id=$1 AND status='open'`,[id,auth.email]);
    }
    const action = body.status
      ? `status:${body.status}`
      : body.featured !== undefined
        ? body.featured ? "featured" : "unfeatured"
        : body.resolveReports
          ? "reports:resolved"
          : "moderation:updated";
    await client.query(`INSERT INTO fan_submission_audit(submission_id,actor_email,action,details)
      VALUES($1,$2,$3,$4::jsonb)`,[id,auth.email,action,JSON.stringify(body)]);
    const row=before.rows[0];
    if(body.status==="approved"&&row.status!=="approved"&&row.user_id){
      await awardPointsInTransaction(client,row.user_id,20,"fan_photo_approved","photo",id);
    }
    return row;
  });
  if(!previous)return NextResponse.json({error:"not found"},{status:404});
  if (
    (body.status === "approved" || body.status === "denied")
    && body.status !== previous.status
    && previous.user_id
  ) {
    // Moderation remains successful if a transient queue write fails; the
    // submission history is still the user's source of truth.
    await queueFanNotification(
      previous.user_id,
      `fan_submission.${body.status}`,
      `${id}:${body.status}`,
      {
        submissionId: id,
        status: body.status,
        denialReason: body.status === "denied" ? body.denialReason : null,
      },
    ).catch(() => false);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await ensureFanzoneSchema();
  const stored = await query<{ storage_key: string | null; thumb_storage_key: string | null }>(
    `SELECT storage_key, thumb_storage_key FROM fan_submissions WHERE id = $1`,
    [id],
  );
  if (!stored.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  await query(
    `INSERT INTO fan_submission_audit (submission_id, actor_email, action)
     VALUES ($1, $2, 'deleted')`,
    [id, auth.email],
  );
  await query("DELETE FROM fan_submissions WHERE id = $1", [id]);
  await Promise.allSettled([
    deletePrivateFanPhoto(stored.rows[0].storage_key),
    deletePrivateFanPhoto(stored.rows[0].thumb_storage_key),
  ]);
  return NextResponse.json({ ok: true });
}
