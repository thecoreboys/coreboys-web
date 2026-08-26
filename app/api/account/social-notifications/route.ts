import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getSocialNotificationSettings, saveSocialNotificationSettings } from "@/lib/social-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  enabled: z.boolean(), inAppEnabled: z.boolean(), pushEnabled: z.boolean(), emailEnabled: z.boolean(),
  rules: z.array(z.object({ memberSlug: z.string().trim().min(1).max(80), contentType: z.enum(["live", "video", "short", "photo", "post"]), enabled: z.boolean() })).max(200),
}).strict();
function privateJson(body: unknown, init?: ResponseInit) { const response = NextResponse.json(body, init); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Vary", "Cookie"); return response; }
export async function GET() { const userId = await getCurrentFanUserId(); return userId ? privateJson({ settings: await getSocialNotificationSettings(userId) }) : privateJson({ error: "unauthorized" }, { status: 401 }); }
export async function PUT(request: Request) { const userId = await getCurrentFanUserId(); if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 }); const parsed = Body.safeParse(await request.json().catch(() => null)); if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 }); await saveSocialNotificationSettings(userId, parsed.data); return privateJson({ ok: true, settings: await getSocialNotificationSettings(userId) }); }
