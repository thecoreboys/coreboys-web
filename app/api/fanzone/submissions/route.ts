import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { ensureFanzoneSchema, receiptTokenMatches } from "@/lib/fanzone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmissionRow = {
  id: string;
  submission_kind: string;
  caption: string | null;
  event_name: string | null;
  status: "pending" | "approved" | "denied";
  denial_reason: string | null;
  member_slugs: string[];
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  receipt_token_hash: string | null;
};

const ReceiptsBody = z.object({
  receipts: z
    .array(z.object({ id: z.string().uuid(), token: z.string().min(20).max(100) }))
    .max(20)
    .default([]),
});

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureFanzoneSchema();
  const result = await query<SubmissionRow>(
    `${selection()} WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return response(result.rows);
}

export async function POST(req: Request) {
  const parsed = ReceiptsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid receipts" }, { status: 400 });
  const userId = await getCurrentFanUserId();
  await ensureFanzoneSchema();
  const ids = parsed.data.receipts.map((receipt) => receipt.id);
  if (!userId && ids.length === 0) return response([]);
  const result = ids.length
    ? await query<SubmissionRow>(
        `${selection()} WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 20`,
        [ids],
      )
    : { rows: [] as SubmissionRow[] };
  const tokens = new Map(parsed.data.receipts.map((receipt) => [receipt.id, receipt.token]));
  const visible = result.rows.filter(
    (row) => receiptTokenMatches(tokens.get(row.id) ?? "", row.receipt_token_hash),
  );
  // A signed-in user may own rows without a receipt. Recheck ownership in SQL
  // without returning user_id to the client.
  if (userId) {
    const owned = await query<SubmissionRow>(
      `${selection()} WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    const merged = new Map([...owned.rows, ...visible].map((row) => [row.id, row]));
    return response([...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  return response(visible);
}

function selection(): string {
  return `SELECT id::text, submission_kind, caption, event_name, status,
                 denial_reason, member_slugs, created_at::text, updated_at::text,
                 approved_at::text, receipt_token_hash
            FROM fan_submissions`;
}

function response(rows: SubmissionRow[]) {
  return NextResponse.json(
    {
      submissions: rows.map((row) => ({
        id: row.id,
        kind: row.submission_kind === "art" ? "art" : "photo",
        caption: row.caption,
        eventName: row.event_name,
        status: row.status,
        denialReason: row.status === "denied" ? row.denial_reason : null,
        memberSlugs: row.member_slugs ?? [],
        submittedAt: row.created_at,
        updatedAt: row.updated_at,
        approvedAt: row.approved_at,
        imageUrl: row.status === "approved" ? `/api/fanzone/photos/${row.id}/image?size=thumb` : null,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
