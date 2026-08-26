import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { buildLoyaltyCard, listLoyalty, siteWatchStats } from "@/lib/oauth/loyalty";
import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureFanOauthSchema();
  const [watch, facts, chats, perk] = await Promise.all([
    siteWatchStats(uid),
    listLoyalty(uid),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM fan_chat_sends
        WHERE user_id = $1 AND created_at > now() - interval '7 days'`,
      [uid],
    ),
    query<{ code: string }>(`SELECT code FROM fan_perk_codes WHERE user_id = $1`, [uid]),
  ]);
  const card = buildLoyaltyCard(facts, null, watch);
  return NextResponse.json({
    window: "7d",
    siteMinutes: watch.minutes7d,
    chatMinutes: watch.chatMinutes7d,
    ytPlays: watch.ytPlays7d,
    vodPlays: watch.vodPlays7d,
    chatsSent: Number(chats.rows[0]?.n ?? 0),
    houseStatus: card.houseStatus,
    perkCode: perk.rows[0]?.code ?? null,
    note: "On-site only. Twitch/YouTube will not give us real watch history.",
  });
}
