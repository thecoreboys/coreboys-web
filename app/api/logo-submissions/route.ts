import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { putPrivateFanPhoto, deletePrivateFanPhoto } from "@/lib/fanzone-storage";
import { ensureLogoSubmissionSchema, isLikelyBot, safeFileName } from "@/lib/logo-submissions";
import { moderateTextLocal } from "@/lib/moderation";
import { query, withTransaction } from "@/lib/db";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/svg+xml", "application/pdf", "application/zip"]);
const Details = z.object({ publicName: z.string().trim().min(2).max(70), designName: z.string().trim().min(2).max(100), description: z.string().trim().min(20).max(2500) });

type PublicRow = { id: string; public_name: string; design_name: string; description: string; created_at: string; upvotes: string; files: Array<{ id: string; file_name: string; content_type: string; file_role: string }> };

export async function GET() {
  await ensureLogoSubmissionSchema();
  const rows = await query<PublicRow>(`
    SELECT s.id::text, s.public_name, s.design_name, s.description, s.created_at::text,
           COUNT(v.submission_id) FILTER (WHERE v.vote='up')::text AS upvotes,
           COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('id', f.id::text, 'file_name', f.file_name, 'content_type', f.content_type, 'file_role', f.file_role) ORDER BY f.created_at)
             FILTER (WHERE f.id IS NOT NULL AND f.public_enabled), '[]'::jsonb) AS files
      FROM logo_submissions s
      LEFT JOIN logo_submission_files f ON f.submission_id=s.id AND f.public_enabled=true
      LEFT JOIN logo_submission_votes v ON v.submission_id=s.id
     WHERE s.status='approved'
     GROUP BY s.id ORDER BY s.created_at DESC LIMIT 120
  `);
  return NextResponse.json({ submissions: rows.rows.map((row) => ({ id: row.id, publicName: row.public_name, designName: row.design_name, description: row.description, submittedAt: row.created_at, upvotes: Number(row.upvotes), files: row.files.map((file) => ({ ...file, url: `/api/logo-submissions/${row.id}/files/${file.id}` })) })) }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to submit a design." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form || isLikelyBot(request, form?.get("company"), form?.get("startedAt"))) return NextResponse.json({ error: "We could not verify this submission." }, { status: 400 });
  const details = Details.safeParse({ publicName: form.get("publicName"), designName: form.get("designName"), description: form.get("description") });
  if (!details.success) return NextResponse.json({ error: "Add a public name, design name, and a short description." }, { status: 400 });
  const textCheck = moderateTextLocal(`${details.data.publicName}\n${details.data.designName}\n${details.data.description}`);
  if (!textCheck.ok) return NextResponse.json({ error: textCheck.reason ?? "Please revise the written details." }, { status: 400 });
  const wordmark = form.get("wordmark"); const icon = form.get("icon");
  if (!(wordmark instanceof File) || !(icon instanceof File)) return NextResponse.json({ error: "Add both a wordmark and an icon." }, { status: 400 });
  const extra = form.getAll("additional").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const files = [{ file: wordmark, role: "wordmark" }, { file: icon, role: "icon" }, ...extra.map((file) => ({ file, role: "additional" }))];
  if (files.length > MAX_FILES || files.some(({ file }) => file.size <= 0 || file.size > MAX_FILE_BYTES || !TYPES.has(file.type))) return NextResponse.json({ error: "Use up to 8 additional PNG, JPG, WEBP, AVIF, SVG, PDF, or ZIP files, each under 10 MB." }, { status: 400 });
  await ensureLogoSubmissionSchema();
  const recent = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM logo_submissions WHERE user_id=$1 AND created_at > now()-interval '24 hours'`, [userId]);
  if (Number(recent.rows[0]?.count ?? 0) >= 5) return NextResponse.json({ error: "You have reached today’s submission limit. Try again tomorrow." }, { status: 429 });
  const id = randomUUID();
  const stored: Array<{ id: string; key: string; file: File; role: string }> = [];
  try {
    for (const entry of files) {
      const fileId = randomUUID(); const key = `logo-submissions/pending/${id}/${fileId}`;
      await putPrivateFanPhoto(key, new Uint8Array(await entry.file.arrayBuffer()), entry.file.type);
      stored.push({ id: fileId, key, file: entry.file, role: entry.role });
    }
    await withTransaction(async (db) => {
      await db.query(`INSERT INTO logo_submissions(id,user_id,public_name,design_name,description) VALUES($1,$2,$3,$4,$5)`, [id, userId, details.data.publicName, details.data.designName, details.data.description]);
      for (const entry of stored) await db.query(`INSERT INTO logo_submission_files(id,submission_id,file_role,file_name,storage_key,content_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7)`, [entry.id, id, entry.role, safeFileName(entry.file.name), entry.key, entry.file.type, entry.file.size]);
    });
  } catch {
    await Promise.allSettled(stored.map((entry) => deletePrivateFanPhoto(entry.key)));
    return NextResponse.json({ error: "Upload is temporarily unavailable." }, { status: 503 });
  }
  return NextResponse.json({ id, status: "pending" }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
