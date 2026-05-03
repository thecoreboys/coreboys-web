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
      return "snapshot_date >= CURRENT_DATE - INTERVAL '1 day'";
    case "7d":
      return "snapshot_date >= CURRENT_DATE - INTERVAL '7 days'";
    case "31d":
      return "snapshot_date >= CURRENT_DATE - INTERVAL '31 days'";
    case "all":
      return "TRUE";
  }
}

type Row = {
  member_slug: string;
  platform: string;
  count: string; // bigint -> string from pg
  snapshot_date: string;
};

/**
 * Read snapshots for the /metrics page. Returns rows grouped by
 * (member_slug, platform), each carrying an array of {date, count}.
 *
 * Optional filters:
 *   • range=1d|7d|31d|all (default 31d)
 *   • platform=twitch|youtube|tiktok|instagram|x — single filter
 *   • slug=__group__|marlon|... — single filter
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const platform = url.searchParams.get("platform");
  const slug = url.searchParams.get("slug");

  const conds: string[] = [rangeWhereClause(range)];
  const params: unknown[] = [];
  if (platform) {
    params.push(platform);
    conds.push(`platform = $${params.length}`);
  }
  if (slug) {
    params.push(slug);
    conds.push(`member_slug = $${params.length}`);
  }

  const sql = `
    SELECT member_slug, platform, count::text AS count, snapshot_date::text AS snapshot_date
    FROM metric_snapshots
    WHERE ${conds.join(" AND ")}
    ORDER BY snapshot_date ASC, member_slug, platform
  `;

  try {
    const result = await query<Row>(sql, params);
    return NextResponse.json({
      range,
      rows: result.rows.map((r) => ({
        slug: r.member_slug,
        platform: r.platform,
        count: Number(r.count),
        date: r.snapshot_date,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "query failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
