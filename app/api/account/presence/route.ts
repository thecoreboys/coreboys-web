import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { recordSiteEvent } from "@/lib/oauth/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["chat_open", "video_play", "live_embed", "vod_play", "heartbeat"]),
  subject: z.string().min(1).max(64).nullable().optional(),
  ref: z.string().max(200).nullable().optional(),
  seconds: z.number().int().min(0).max(180).optional(),
});

export async function POST(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return new Response(null, { status: 204 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await recordSiteEvent(uid, body.kind, body.subject ?? null, body.ref, body.seconds ?? 0);
  return NextResponse.json({ ok: true });
}
