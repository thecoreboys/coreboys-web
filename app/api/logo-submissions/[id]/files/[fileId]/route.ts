import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { ensureLogoSubmissionSchema, isRenderableImage, safeFileName } from "@/lib/logo-submissions";
import { getPrivateFanPhoto } from "@/lib/fanzone-storage";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const values = await params; const id = z.string().uuid().safeParse(values.id); const fileId = z.string().uuid().safeParse(values.fileId);
  if (!id.success || !fileId.success) return new NextResponse(null, { status: 404 });
  await ensureLogoSubmissionSchema();
  const found = await query<{ storage_key: string; content_type: string; file_name: string }>(`SELECT f.storage_key,f.content_type,f.file_name FROM logo_submission_files f JOIN logo_submissions s ON s.id=f.submission_id WHERE f.id=$1 AND f.submission_id=$2 AND f.public_enabled=true AND s.status='approved'`, [fileId.data, id.data]);
  const row = found.rows[0]; if (!row) return new NextResponse(null, { status: 404 });
  try { const stored = await getPrivateFanPhoto(row.storage_key); const body = stored.bytes.buffer.slice(stored.bytes.byteOffset, stored.bytes.byteOffset + stored.bytes.byteLength) as ArrayBuffer; return new NextResponse(body, { headers: { "Content-Type": row.content_type, "Content-Disposition": `${isRenderableImage(row.content_type) ? "inline" : "attachment"}; filename=\"${safeFileName(row.file_name)}\"`, "Cache-Control": "public, max-age=3600" } }); } catch { return new NextResponse(null, { status: 404 }); }
}
