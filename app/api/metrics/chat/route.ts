import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Range = "1d" | "7d" | "31d" | "all";

function parseRange(input: string | null): Range {
  if (input === "1d" || input === "7d" || input === "31d" || input === "all") return input;
  return "7d";
}

function whereClause(range: Range): string {
  switch (range) {
    case "1d": return "hour_utc >= NOW() - INTERVAL '1 day'";
    case "7d": return "hour_utc >= NOW() - INTERVAL '7 days'";
    case "31d": return "hour_utc >= NOW() - INTERVAL '31 days'";
    case "all": return "TRUE";
  }
}

/**
 * Reads chat_metrics (written by the chat-listener worker) and returns
 * the per-hour rollup for the requested range. The /metrics page
 * aggregates this into per-member trends + combined totals.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  try {
    const r = await query<{
      member_slug: string;
      hour_utc: string;
      message_count: number;
      unique_chatters: number;
    }>(
      `SELECT member_slug, hour_utc::text, message_count, unique_chatters
       FROM chat_metrics
       WHERE ${whereClause(range)}
       ORDER BY hour_utc ASC`,
    );
    return NextResponse.json({
      range,
      rows: r.rows.map((row) => ({
        slug: row.member_slug,
        hour: row.hour_utc,
        messages: row.message_count,
        chatters: row.unique_chatters,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "query failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
