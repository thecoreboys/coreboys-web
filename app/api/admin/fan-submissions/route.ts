import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { ensureFanzoneSchema } from "@/lib/fanzone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin review endpoint. Public uploads use /api/fanzone/photos so callers
 * cannot bypass binary validation, metadata stripping, or private storage. */

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  await ensureFanzoneSchema();
  const r = await query<{
    id: string; file_url: string; thumb_url: string | null; caption: string | null;
    submitter_first_name: string; submitter_last_name: string;
    submitter_email: string; member_slugs: string[];
    status: string; denial_reason: string | null;
    created_at: string; updated_at: string; submission_kind: string;
    story: string | null; event_name: string | null; happened_on: string | null;
    location_label: string | null; photographer_credit: string | null;
    moderation_status: string; moderation_notes: string | null;
    featured: boolean; report_count: string;
    reports: Array<{ reason: string; details: string | null; createdAt: string }>;
    audit: Array<{ action: string; actorEmail: string; createdAt: string }>;
  }>(
    `SELECT fs.id::text,
            CASE WHEN fs.storage_key IS NOT NULL
              THEN '/api/admin/fan-submissions/' || fs.id::text || '/image'
              ELSE fs.file_url END AS file_url,
            CASE WHEN fs.thumb_storage_key IS NOT NULL
              THEN '/api/admin/fan-submissions/' || fs.id::text || '/image?size=thumb'
              ELSE fs.thumb_url END AS thumb_url,
            fs.caption,
            submitter_first_name, submitter_last_name, submitter_email,
            member_slugs, fs.status, denial_reason, fs.created_at::text,
            fs.updated_at::text, submission_kind, story, event_name,
            happened_on::text, location_label, photographer_credit,
            moderation_status, moderation_notes, featured,
            COUNT(fr.id)::text AS report_count,
            COALESCE(
              JSONB_AGG(JSONB_BUILD_OBJECT(
                'reason', fr.reason,
                'details', fr.details,
                'createdAt', fr.created_at
              ) ORDER BY fr.created_at DESC) FILTER (WHERE fr.id IS NOT NULL),
              '[]'::jsonb
            ) AS reports,
            COALESCE((
              SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'action', recent.action,
                'actorEmail', recent.actor_email,
                'createdAt', recent.created_at
              ) ORDER BY recent.created_at DESC)
              FROM (
                SELECT action, actor_email, created_at
                  FROM fan_submission_audit
                 WHERE submission_id = fs.id
                 ORDER BY created_at DESC
                 LIMIT 8
              ) recent
            ), '[]'::jsonb) AS audit
     FROM fan_submissions fs
     LEFT JOIN fan_photo_reports fr ON fr.submission_id = fs.id AND fr.status = 'open'
     GROUP BY fs.id
     ORDER BY fs.created_at DESC`,
  );
  return NextResponse.json({ submissions: r.rows });
}

export async function POST() {
  return NextResponse.json(
    { error: "Use the validated /api/fanzone/photos upload endpoint." },
    { status: 410 },
  );
}
