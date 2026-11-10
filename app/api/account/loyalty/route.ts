import { NextResponse } from "next/server";
import { accountRequestMatches, ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { query } from "@/lib/db";
import { buildLoyaltyCard, listLoyalty, siteWatchStats } from "@/lib/oauth/loyalty";
import { listConnections } from "@/lib/oauth/connections";
import { validatePublicHandle } from "@/lib/public-handle";
import { MEMBERS } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!accountRequestMatches(req, uid)) return NextResponse.json({ error: "account_changed", message: ACCOUNT_CHANGED_MESSAGE }, { status: 409 });
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
    accountId: uid,
    card,
    connections,
    publicCard: Boolean(row?.public_card),
    publicSlug: row?.public_slug ?? null,
    favoriteMember: row?.favorite_member ?? null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!accountRequestMatches(req, uid)) return NextResponse.json({ error: "account_changed", message: ACCOUNT_CHANGED_MESSAGE }, { status: 409 });
  let body: { favoriteMember?: string | null; publicCard?: boolean; publicSlug?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || (body.publicCard !== undefined && typeof body.publicCard !== "boolean")
    || (body.publicSlug !== undefined && body.publicSlug !== null && typeof body.publicSlug !== "string")
    || (body.favoriteMember !== undefined && body.favoriteMember !== null && (typeof body.favoriteMember !== "string" || !MEMBERS.some((member) => member.slug === body.favoriteMember)))) {
    return NextResponse.json({ error: "Invalid profile settings." }, { status: 400 });
  }
  const handleResult = typeof body.publicSlug === "string" && body.publicSlug.trim()
    ? validatePublicHandle(body.publicSlug)
    : body.publicSlug !== undefined ? { ok: true as const, handle: null } : null;
  if (handleResult && !handleResult.ok) return NextResponse.json({ error: handleResult.error }, { status: 400 });
  const slug = handleResult?.ok ? handleResult.handle : undefined;
  if (slug) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM fan_users WHERE lower(public_slug) = lower($1) AND id <> $2 LIMIT 1`,
      [slug, uid],
    );
    if (existing.rows.length) return NextResponse.json({ error: "That handle is already in use." }, { status: 409 });
  }
  try {
  const updated = await query<{ public_card: boolean; public_slug: string | null; favorite_member: string | null }>(
    `UPDATE fan_users
        SET favorite_member = CASE WHEN $5::boolean THEN $2 ELSE favorite_member END,
            public_card     = COALESCE($3, public_card),
            public_slug     = CASE WHEN $6::boolean THEN $4 ELSE public_slug END
      WHERE id = $1 AND (NOT COALESCE($3, public_card) OR (CASE WHEN $6::boolean THEN $4 ELSE public_slug END) IS NOT NULL)
      RETURNING public_card, public_slug, favorite_member`,
    [
      uid,
      body.favoriteMember === undefined ? null : body.favoriteMember,
      body.publicCard === undefined ? null : body.publicCard,
      slug === undefined ? null : slug,
      body.favoriteMember !== undefined,
      body.publicSlug !== undefined,
    ],
  );
  const row = updated.rows[0];
  if (!row) return NextResponse.json({ error: "Add a public handle before publishing your profile." }, { status: 400 });
  return NextResponse.json({ ok: true, accountId: uid, publicCard: row.public_card, publicSlug: row.public_slug, favoriteMember: row.favorite_member }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return NextResponse.json({ error: "That handle is already in use." }, { status: 409 });
    throw error;
  }
}
