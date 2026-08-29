import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { clientIp, ensureLogoSubmissionSchema, fingerprintIp, isLikelyBot } from "@/lib/logo-submissions";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ vote: z.enum(["up", "down"]), company: z.string().max(0).optional(), startedAt: z.coerce.number() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsedId = z.string().uuid().safeParse((await params).id); const body = Body.safeParse(await request.json().catch(() => null));
  if (!parsedId.success || !body.success || isLikelyBot(request, body.data?.company, body.data?.startedAt)) return NextResponse.json({ error: "We could not verify this vote." }, { status: 400 });
  await ensureLogoSubmissionSchema();
  const ip = fingerprintIp(clientIp(request));
  const limit = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM logo_submission_votes WHERE ip_fingerprint=$1 AND updated_at > now()-interval '1 hour'`, [ip]);
  if (Number(limit.rows[0]?.count ?? 0) >= 30) return NextResponse.json({ error: "Please wait before voting again." }, { status: 429, headers: { "Retry-After": "3600" } });
  const exists = await query(`SELECT 1 FROM logo_submissions WHERE id=$1 AND status='approved'`, [parsedId.data]);
  if (!exists.rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  const saved = await query(`INSERT INTO logo_submission_votes(submission_id,ip_fingerprint,vote) VALUES($1,$2,$3) ON CONFLICT(submission_id,ip_fingerprint) DO NOTHING RETURNING vote`, [parsedId.data, ip, body.data.vote]);
  const count = await query<{ count: string }>(`SELECT COUNT(*) FILTER (WHERE vote='up')::text AS count FROM logo_submission_votes WHERE submission_id=$1`, [parsedId.data]);
  return NextResponse.json({ upvotes: Number(count.rows[0]?.count ?? 0), recorded: (saved.rowCount ?? 0) > 0 });
}
