import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { listApplications } from "@/lib/contributors/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const cursorSchema = z.object({ at: z.string().max(80).refine(value => Number.isFinite(Date.parse(value))), id: z.string().uuid() });
export async function GET(request: Request) {
  const auth = await requireAdmin(); if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
  const params = new URL(request.url).searchParams;
  const parsed = params.has("at") || params.has("id") ? cursorSchema.safeParse({ at: params.get("at"), id: params.get("id") }) : null;
  if (parsed && !parsed.success) return NextResponse.json({ error: "Invalid page." }, { status: 400, headers });
  try { return NextResponse.json(await listApplications(parsed?.success ? parsed.data : null), { headers }); }
  catch { return NextResponse.json({ error: "Applications could not be loaded." }, { status: 503, headers }); }
}
