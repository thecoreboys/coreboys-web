import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listSocialAlerts, markSocialAlertRead } from "@/lib/social-events";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
function privateJson(body: unknown, init?: ResponseInit) { const response = NextResponse.json(body, init); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Vary", "Cookie"); return response; }
export async function GET(request: Request) { const userId = await getCurrentFanUserId(); if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 }); const url = new URL(request.url); return privateJson({ alerts: await listSocialAlerts(userId, Number(url.searchParams.get("limit") ?? 40), url.searchParams.get("before")) }); }
export async function PATCH(request: Request) { const userId = await getCurrentFanUserId(); if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 }); const body = await request.json().catch(() => null); if (!body || typeof body.id !== "string") return privateJson({ error: "invalid_payload" }, { status: 400 }); return privateJson({ ok: await markSocialAlertRead(userId, body.id) }); }
