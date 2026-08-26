import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { getSocialSourceHealth } from "@/lib/social-events";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const auth = await requireAdmin(); if (!auth.ok) return auth.response; return NextResponse.json({ sources: await getSocialSourceHealth(), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } }); }
