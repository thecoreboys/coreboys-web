import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { ensureLogoSubmissionSchema } from "@/lib/logo-submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  await ensureLogoSubmissionSchema();
  const result = await query(`
    SELECT s.id::text, s.public_name, s.design_name, s.description, s.status, s.denial_reason,
           s.created_at::text, s.updated_at::text, u.display_name AS submitter_name, u.email AS submitter_email,
           COUNT(v.submission_id) FILTER (WHERE v.vote='up')::text AS upvotes,
           COUNT(v.submission_id) FILTER (WHERE v.vote='down')::text AS downvotes,
           COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('id',f.id::text,'fileName',f.file_name,'role',f.file_role,'contentType',f.content_type,'sizeBytes',f.size_bytes,'publicEnabled',f.public_enabled) ORDER BY f.created_at) FILTER (WHERE f.id IS NOT NULL),'[]'::jsonb) AS files
      FROM logo_submissions s
      JOIN fan_users u ON u.id=s.user_id
      LEFT JOIN logo_submission_files f ON f.submission_id=s.id
      LEFT JOIN logo_submission_votes v ON v.submission_id=s.id
     GROUP BY s.id,u.display_name,u.email
     ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, s.created_at DESC
  `);
  return NextResponse.json({ submissions: result.rows }, { headers: { "Cache-Control": "private, no-store" } });
}
