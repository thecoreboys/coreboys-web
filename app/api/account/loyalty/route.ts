import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { query } from "@/lib/db";
import { buildLoyaltyCard, listLoyalty, siteWatchStats } from "@/lib/oauth/loyalty";
import { listConnections } from "@/lib/oauth/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [facts, connections, user, watch] = await Promise.all([
    listLoyalty(uid),
    listConnections(uid),
    query<{ favorite_member: string | null; public_card: boolean; public_slug: string | null }>(
      `SELECT favorite_member, public_card, public_slug FROM fan_users WHERE id = $1`,
      [uid],
    ),
    siteWatchStats(uid),
  ]);
  const row = user.rows[0];
  const card = buildLoyaltyCard(facts, row?.favorite_member ?? null, watch);
  return NextResponse.json({
    card,
    connections,
    publicCard: Boolean(row?.public_card),
    publicSlug: row?.public_slug ?? null,
    favoriteMember: row?.favorite_member ?? card.favoriteSlug,
  });
}

export async function PATCH(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { favoriteMember?: string | null; publicCard?: boolean; publicSlug?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const slug =
    typeof body.publicSlug === "string"
      ? body.publicSlug
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 32)
      : undefined;
  await query(
    `UPDATE fan_users
        SET favorite_member = COALESCE($2, favorite_member),
            public_card     = COALESCE($3, public_card),
            public_slug     = COALESCE($4, public_slug)
      WHERE id = $1`,
    [
      uid,
      body.favoriteMember === undefined ? null : body.favoriteMember,
      body.publicCard === undefined ? null : body.publicCard,
      slug === undefined ? null : slug || null,
    ],
  );
  return NextResponse.json({ ok: true });
}
