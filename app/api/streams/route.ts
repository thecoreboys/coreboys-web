import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { loadAirtimeDailyArchive } from "@/lib/watch/airtime-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Range = "1d" | "7d" | "31d" | "all";

function parseRange(input: string | null): Range {
  if (input === "1d" || input === "7d" || input === "31d" || input === "all") {
    return input;
  }
  return "31d";
}

function rangeWhereClause(range: Range): string {
  switch (range) {
    case "1d":
      return "started_at >= NOW() - INTERVAL '1 day'";
    case "7d":
      return "started_at >= NOW() - INTERVAL '7 days'";
    case "31d":
      return "started_at >= NOW() - INTERVAL '31 days'";
    case "all":
      return "TRUE";
  }
}

type SessionRow = {
  id: string;
  member_slug: string;
  started_at: string;
  ended_at: string | null;
  total_minutes: number;
  peak_viewers: number;
  sum_viewers: string;
  sample_count: number;
  title: string | null;
  game: string | null;
  twitch_stream_id: string | null;
};

/**
 * Stream-session reader for the /metrics page. Returns:
 *   • sessions: per-stream rows in the requested range
 *   • per-day airtime aggregate for the consistency heatmap
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const slug = url.searchParams.get("slug");

  const conds: string[] = [rangeWhereClause(range)];
  const params: unknown[] = [];
  if (slug) {
    params.push(slug);
    conds.push(`member_slug = $${params.length}`);
  }

  try {
    const sessionsPromise = query<SessionRow>(
      `SELECT id::text, member_slug,
              started_at::text, ended_at::text,
              total_minutes, peak_viewers,
              sum_viewers::text, sample_count,
              title, game, twitch_stream_id
       FROM stream_sessions
       WHERE ${conds.join(" AND ")}
       ORDER BY started_at DESC`,
      params,
    );

    // Per-day per-member airtime totals — drives the consistency grid.
    // We use 365 days regardless of `range` so the heatmap stays full.
    const observedDailyPromise = query<{
      member_slug: string;
      day: string;
      minutes: string;
      sessions: string;
      peak_viewers: string;
    }>(
      `SELECT member_slug,
              DATE(started_at)::text AS day,
              SUM(total_minutes)::text AS minutes,
              COUNT(*)::text AS sessions,
              MAX(peak_viewers)::text AS peak_viewers
       FROM stream_sessions
       WHERE started_at >= NOW() - INTERVAL '365 days'
       GROUP BY member_slug, DATE(started_at)
       ORDER BY day ASC`,
    );

    // The durable archive holds on to days that may no longer be retained in
    // `stream_sessions`. It returns [] safely on deployments awaiting its
    // migration, leaving the direct session rollup as the fallback.
    const [sessions, observedDaily, archivedDaily] = await Promise.all([
      sessionsPromise,
      observedDailyPromise,
      loadAirtimeDailyArchive({ days: 370 }),
    ]);
    const dailyByKey = new Map<string, {
      slug: string;
      date: string;
      minutes: number;
      sessions: number;
      peakViewers: number;
    }>();
    for (const row of observedDaily.rows) {
      const date = row.day.slice(0, 10);
      dailyByKey.set(`${row.member_slug}:${date}`, {
        slug: row.member_slug,
        date,
        minutes: Number(row.minutes),
        sessions: Number(row.sessions),
        peakViewers: Number(row.peak_viewers),
      });
    }
    for (const row of archivedDaily) {
      dailyByKey.set(`${row.slug}:${row.date}`, {
        slug: row.slug,
        date: row.date,
        minutes: row.minutes,
        sessions: row.sessions,
        peakViewers: row.peakViewers,
      });
    }

    return NextResponse.json({
      range,
      sessions: sessions.rows.map((r) => ({
        id: r.id,
        slug: r.member_slug,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        totalMinutes: r.total_minutes,
        peakViewers: r.peak_viewers,
        avgViewers:
          r.sample_count > 0 ? Math.round(Number(r.sum_viewers) / r.sample_count) : 0,
        title: r.title,
        game: r.game,
        twitchStreamId: r.twitch_stream_id,
        source: "observed",
      })),
      daily: [...dailyByKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug)),
    });
  } catch (e) {
    // Airtime history is enrichment, not a prerequisite for Watch or Guide.
    // Keep those surfaces usable while a fresh deployment is awaiting its
    // analytics table/database, and expose an explicit diagnostic flag.
    return NextResponse.json({
      range,
      sessions: [],
      daily: [],
      unavailable: true,
      ...(process.env.NODE_ENV === "development"
        ? { detail: e instanceof Error ? e.message : String(e) }
        : {}),
    });
  }
}
