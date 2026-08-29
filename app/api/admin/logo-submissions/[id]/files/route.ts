import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { ensureLogoSubmissionSchema, safeFileName } from "@/lib/logo-submissions";
import { putPrivateFanPhoto, deletePrivateFanPhoto } from "@/lib/fanzone-storage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/svg+xml", "application/pdf", "application/zip"]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  const id = z.string().uuid().safeParse((await params).id); if (!id.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const form = await request.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 10 * 1024 * 1024 || !TYPES.has(file.type)) return NextResponse.json({ error: "Use a supported file smaller than 10 MB." }, { status: 400 });
  const role = form?.get("role") === "wordmark" || form?.get("role") === "icon" ? String(form.get("role")) : "additional";
  const publicEnabled = form?.get("publicEnabled") === "true"; await ensureLogoSubmissionSchema();
  const exists = await query(`SELECT 1 FROM logo_submissions WHERE id=$1`, [id.data]); if (!exists.rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fileId = randomUUID(); const key = `logo-submissions/admin/${id.data}/${fileId}`;
  try { await putPrivateFanPhoto(key, new Uint8Array(await file.arrayBuffer()), file.type); await query(`INSERT INTO logo_submission_files(id,submission_id,file_role,file_name,storage_key,content_type,size_bytes,public_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [fileId,id.data,role,safeFileName(file.name),key,file.type,file.size,publicEnabled]); }
  catch { await deletePrivateFanPhoto(key).catch(() => undefined); return NextResponse.json({ error: "Upload is temporarily unavailable." }, { status: 503 }); }
  return NextResponse.json({ id: fileId });
}
