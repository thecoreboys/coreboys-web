import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { query } from "@/lib/db";
import { buildLoyaltyCard, listLoyalty, siteWatchStats } from "@/lib/oauth/loyalty";
import { listConnections } from "@/lib/oauth/connections";
import { validatePublicHandle } from "@/lib/public-handle";

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
  const handleResult = typeof body.publicSlug === "string" && body.publicSlug.trim()
    ? validatePublicHandle(body.publicSlug)
    : body.publicSlug === null ? { ok: true as const, handle: null } : null;
  if (handleResult && !handleResult.ok) return NextResponse.json({ error: handleResult.error }, { status: 400 });
  const slug = handleResult?.ok ? handleResult.handle : undefined;
  if (slug) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM fan_users WHERE lower(public_slug) = lower($1) AND id <> $2 LIMIT 1`,
      [slug, uid],
    );
    if (existing.rows.length) return NextResponse.json({ error: "That handle is already in use." }, { status: 409 });
  }
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
      slug === undefined ? null : slug,
    ],
  );
  return NextResponse.json({ ok: true });
}
