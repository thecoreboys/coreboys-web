import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { buildLoyaltyCard, listLoyalty } from "@/lib/oauth/loyalty";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const card = buildLoyaltyCard(await listLoyalty(uid), null);
  if (card.houseStatus !== "super") {
    return NextResponse.json({ code: null, tier: card.houseStatus });
  }
  await ensureFanOauthSchema();
  const existing = await query<{ code: string }>(
    `SELECT code FROM fan_perk_codes WHERE user_id = $1`,
    [uid],
  );
  if (existing.rows[0]) {
    return NextResponse.json({ code: existing.rows[0].code, tier: "super" });
  }
  const slug = createHash("sha256").update(uid).digest("hex").slice(0, 8).toUpperCase();
  const code = `CORE-SUPER-${slug}`;
  await query(
    `INSERT INTO fan_perk_codes (user_id, code, tier) VALUES ($1,$2,'super')
     ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, tier = EXCLUDED.tier`,
    [uid, code],
  );
  return NextResponse.json({ code, tier: "super" });
}
