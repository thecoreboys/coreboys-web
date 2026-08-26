import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { runFanZoneRetention } from "@/lib/fanzone-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validCronSecret(req: Request): boolean {
  const expected = process.env.FANZONE_CRON_SECRET;
  const supplied = req.headers.get("x-cron-secret");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(req: Request) {
  if (!validCronSecret(req)) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }
  const result = await runFanZoneRetention();
  return NextResponse.json({ ok: true, ...result });
}
