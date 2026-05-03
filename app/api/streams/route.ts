import { NextResponse } from "next/server";
import { query } from "@/lib/db";

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
    const sessions = await query<SessionRow>(
      `SELECT id::text, member_slug,
              started_at::text, ended_at::text,
              total_minutes, peak_viewers,
              sum_viewers::text, sample_count,
              title, game
       FROM stream_sessions
       WHERE ${conds.join(" AND ")}
       ORDER BY started_at DESC`,
      params,
    );

    // Per-day per-member airtime totals — drives the consistency grid.
    // We use 365 days regardless of `range` so the heatmap stays full.
    const daily = await query<{
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
      })),
      daily: daily.rows.map((r) => ({
        slug: r.member_slug,
        date: r.day,
        minutes: Number(r.minutes),
        sessions: Number(r.sessions),
        peakViewers: Number(r.peak_viewers),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "query failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
