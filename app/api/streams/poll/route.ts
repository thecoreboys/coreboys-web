import { NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { fetchLiveStreams } from "@/lib/twitch";
import { reconcileLiveSessions, type LivePulse } from "@/lib/streams/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream-session poller. Hit this every ~5 minutes by a cron and it
 * reconciles the `stream_sessions` table against Twitch's current live
 * state. The public live endpoint also records opportunistically so
 * Guide / Watch / Theater stay current even if cron is late.
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

  const logins = MEMBERS.map((m) => m.twitchLogin);
  let streams;
  try {
    streams = await fetchLiveStreams(logins);
  } catch (e) {
    return NextResponse.json(
      { error: "twitch fetch failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  const liveByLogin = new Map(streams.map((s) => [s.user_login.toLowerCase(), s]));

  const pulses: LivePulse[] = MEMBERS.map((m) => {
    const stream = liveByLogin.get(m.twitchLogin.toLowerCase());
    return {
      slug: m.slug,
      login: m.twitchLogin.toLowerCase(),
      isLive: Boolean(stream),
      streamId: stream?.id ?? null,
      startedAt: stream?.started_at,
      viewerCount: stream?.viewer_count,
      title: stream?.title,
      game: stream?.game_name,
    };
  });

  try {
    const result = await reconcileLiveSessions(pulses);
    return NextResponse.json({
      ok: true,
      ...result,
      polledAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "reconcile failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
