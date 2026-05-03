import { NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { fetchLiveStreams, type TwitchStream } from "@/lib/twitch";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream-session poller. Hit this every ~5 minutes by a cron and it
 * reconciles the `stream_sessions` table against Twitch's current live
 * state:
 *
 *   1. New live, no open session → INSERT a row.
 *   2. Still live, open session  → UPDATE peak / sum_viewers / count.
 *   3. Was live, no longer is    → CLOSE the open row (set ended_at,
 *                                   total_minutes).
 *
 * Auth: same shared `x-cron-secret` header as the daily snapshot route.
 */
export async function POST(req: Request) {
  const secret = process.env.METRICS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "METRICS_CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const provided = (req.headers.get("x-cron-secret") ?? "").trim();
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pull all logins → current live streams via Twitch Helix.
  const logins = MEMBERS.map((m) => m.twitchLogin);
  let streams: TwitchStream[];
  try {
    streams = await fetchLiveStreams(logins);
  } catch (e) {
    return NextResponse.json(
      { error: "twitch fetch failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  const liveByLogin = new Map(streams.map((s) => [s.user_login.toLowerCase(), s]));

  // Pull every currently-open session in one query and key by member.
  const openRes = await query<{
    member_slug: string;
    started_at: string;
    twitch_stream_id: string | null;
  }>(
    `SELECT member_slug, started_at::text, twitch_stream_id
     FROM stream_sessions WHERE ended_at IS NULL`,
  );
  const openBySlug = new Map(openRes.rows.map((r) => [r.member_slug, r]));

  let opened = 0;
  let updated = 0;
  let closed = 0;

  for (const m of MEMBERS) {
    const stream = liveByLogin.get(m.twitchLogin.toLowerCase());
    const open = openBySlug.get(m.slug);

    if (stream && !open) {
      // Newly live — open a session.
      await query(
        `INSERT INTO stream_sessions
           (member_slug, twitch_login, twitch_stream_id, started_at,
            peak_viewers, sum_viewers, sample_count, title, game, last_polled_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,NOW())`,
        [
          m.slug,
          m.twitchLogin.toLowerCase(),
          stream.id,
          stream.started_at,
          stream.viewer_count,
          stream.viewer_count,
          stream.title ?? null,
          stream.game_name ?? null,
        ],
      );
      opened++;
    } else if (stream && open) {
      // Still live — fold this poll into the running totals.
      await query(
        `UPDATE stream_sessions SET
            peak_viewers = GREATEST(peak_viewers, $1),
            sum_viewers = sum_viewers + $1,
            sample_count = sample_count + 1,
            title = $2,
            game = $3,
            last_polled_at = NOW()
         WHERE member_slug = $4 AND ended_at IS NULL`,
        [
          stream.viewer_count,
          stream.title ?? null,
          stream.game_name ?? null,
          m.slug,
        ],
      );
      updated++;
    } else if (!stream && open) {
      // Stream just ended — close out the row.
      await query(
        `UPDATE stream_sessions SET
            ended_at = NOW(),
            total_minutes = GREATEST(
              0,
              CAST(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60 AS INTEGER)
            )
         WHERE member_slug = $1 AND ended_at IS NULL`,
        [m.slug],
      );
      closed++;
    }
    // !stream && !open: nothing to do.
  }

  return NextResponse.json({
    ok: true,
    opened,
    updated,
    closed,
    polledAt: new Date().toISOString(),
  });
}
