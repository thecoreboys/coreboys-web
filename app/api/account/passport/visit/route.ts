import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { recordPassportActivity } from "@/lib/passport/activity";
import { resolveNetworkChannel } from "@/lib/watch/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ channelSlug: z.string().trim().min(1).max(80) }).strict();

/** Records a real mounted channel visit without exposing a generic XP API. */
export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return new Response(null, { status: 204 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const channel = resolveNetworkChannel(parsed.data.channelSlug);
  if (!channel) return NextResponse.json({ error: "unknown_channel" }, { status: 404 });

  try {
    await recordPassportActivity({
      userId,
      metric: "visit_channel",
      amount: 1,
      channelSlug: channel.slug,
      sourceType: "channel",
      sourceId: channel.slug,
      idempotencyKey: `visit:${channel.slug}`,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "passport_unavailable" }, { status: 503 });
  }
}
