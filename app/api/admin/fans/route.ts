import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  await ensureFanOauthSchema();

  const [users, conns, loyalty, chat] = await Promise.all([
    query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM fan_users`),
    query<{ provider: string; n: string }>(
      `SELECT provider, COUNT(*)::text AS n
         FROM fan_oauth_connections GROUP BY provider`,
    ),
    query<{
      twitch_follows: string;
      twitch_subs: string;
      youtube_subs: string;
      x_follows: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE platform = 'twitch' AND kind = 'follow' AND value)::text AS twitch_follows,
         COUNT(*) FILTER (WHERE platform = 'twitch' AND kind = 'sub' AND value)::text AS twitch_subs,
         COUNT(*) FILTER (WHERE platform = 'youtube' AND kind = 'sub' AND value)::text AS youtube_subs,
         COUNT(*) FILTER (WHERE platform = 'x' AND kind = 'follow' AND value)::text AS x_follows
         FROM fan_loyalty`,
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM fan_chat_sends WHERE created_at > now() - interval '24 hours'`,
    ),
  ]);

  const overlap = await query<{ k: string; n: string }>(
    `SELECT COUNT(DISTINCT subject)::text AS k, COUNT(*)::text AS n FROM (
        SELECT user_id, subject
          FROM fan_loyalty
         WHERE platform = 'twitch' AND kind = 'follow' AND value
         GROUP BY user_id, subject
     ) t
     -- placeholder; real overlap computed below
     LIMIT 0`,
  );
  void overlap;

  const followOverlap = await query<{ members: string; fans: string }>(
    `SELECT members::text, COUNT(*)::text AS fans FROM (
        SELECT user_id, COUNT(DISTINCT subject) AS members
          FROM fan_loyalty
         WHERE platform = 'twitch' AND kind = 'follow' AND value
           AND subject <> 'house'
         GROUP BY user_id
     ) s
     GROUP BY members
     ORDER BY members`,
  );

  const neverConnected = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM fan_users u
      WHERE NOT EXISTS (
        SELECT 1 FROM fan_oauth_connections c WHERE c.user_id = u.id
      )`,
  );

  return NextResponse.json({
    signups: Number(users.rows[0]?.n ?? 0),
    connected: Object.fromEntries(conns.rows.map((r) => [r.provider, Number(r.n)])),
    loyalty: {
      twitchFollows: Number(loyalty.rows[0]?.twitch_follows ?? 0),
      twitchSubs: Number(loyalty.rows[0]?.twitch_subs ?? 0),
      youtubeSubs: Number(loyalty.rows[0]?.youtube_subs ?? 0),
      xFollows: Number(loyalty.rows[0]?.x_follows ?? 0),
    },
    chatSends24h: Number(chat.rows[0]?.n ?? 0),
    followOverlap: followOverlap.rows.map((r) => ({
      members: Number(r.members),
      fans: Number(r.fans),
    })),
    neverConnected: Number(neverConnected.rows[0]?.n ?? 0),
  });
}
