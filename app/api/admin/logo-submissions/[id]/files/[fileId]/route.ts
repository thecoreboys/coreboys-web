import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { ensureLogoSubmissionSchema, safeFileName } from "@/lib/logo-submissions";
import { getPrivateFanPhoto } from "@/lib/fanzone-storage";
import { deletePrivateFanPhoto } from "@/lib/fanzone-storage";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  const values = await params; const id = z.string().uuid().safeParse(values.id); const fileId=z.string().uuid().safeParse(values.fileId); if(!id.success||!fileId.success)return new NextResponse(null,{status:404});
  await ensureLogoSubmissionSchema(); const result=await query<{storage_key:string;content_type:string;file_name:string}>(`SELECT storage_key,content_type,file_name FROM logo_submission_files WHERE id=$1 AND submission_id=$2`,[fileId.data,id.data]); const file=result.rows[0]; if(!file)return new NextResponse(null,{status:404});
  try { const stored=await getPrivateFanPhoto(file.storage_key); const body=stored.bytes.buffer.slice(stored.bytes.byteOffset,stored.bytes.byteOffset+stored.bytes.byteLength) as ArrayBuffer; return new NextResponse(body,{headers:{"Content-Type":file.content_type,"Content-Disposition":`attachment; filename=\"${safeFileName(file.file_name)}\"`,"Cache-Control":"private, no-store"}}); } catch { return new NextResponse(null,{status:404}); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  const values = await params; const id = z.string().uuid().safeParse(values.id); const fileId=z.string().uuid().safeParse(values.fileId); if(!id.success||!fileId.success)return NextResponse.json({error:"not found"},{status:404});
  await ensureLogoSubmissionSchema(); const found=await query<{storage_key:string}>(`DELETE FROM logo_submission_files WHERE id=$1 AND submission_id=$2 RETURNING storage_key`,[fileId.data,id.data]); const file=found.rows[0]; if(!file)return NextResponse.json({error:"not found"},{status:404});
  await deletePrivateFanPhoto(file.storage_key).catch(() => undefined); return NextResponse.json({ ok: true });
}
