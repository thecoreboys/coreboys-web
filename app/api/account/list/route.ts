import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { EntitlementDeniedError, requireAccountEntitlement } from "@/lib/subscriptions/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ItemId = z.string().min(1).max(200);

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function requireDvrAccess(userId: string, request: Request) {
  try {
    await requireAccountEntitlement({
      userId,
      requestHostname: new URL(request.url).hostname,
      featureId: "dvr.extended_retention",
    });
    return null;
  } catch (error) {
    if (error instanceof EntitlementDeniedError) {
      return privateJson({
        error: error.code,
        featureId: error.featureId,
        requiredPlanId: error.requiredPlanId,
        upgradeHref: `/upgrade?feature=${encodeURIComponent(error.featureId)}`,
      }, { status: 403 });
    }
    throw error;
  }
}

async function list(userId: string) {
  const { rows } = await query<{ item_ref: string }>(
    `SELECT item_ref
       FROM fan_watch_list
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 80`,
    [userId],
  );
  return rows.map((row) => row.item_ref);
}

export async function GET(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ ids: [] }, { status: 401 });
  const denied = await requireDvrAccess(userId, request);
  if (denied) return denied;
  await ensureFanOauthSchema();
  return privateJson({ ids: await list(userId) });
}

const MergeBody = z.object({ ids: z.array(ItemId).max(80).default([]) });

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ ids: [] }, { status: 401 });
  const denied = await requireDvrAccess(userId, request);
  if (denied) return denied;
  const parsed = MergeBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  await ensureFanOauthSchema();
  const ids = [...new Set(parsed.data.ids)];
  if (ids.length) {
    await query(
      `INSERT INTO fan_watch_list (user_id, item_ref)
       SELECT $1, unnest($2::text[])
       ON CONFLICT (user_id, item_ref) DO NOTHING`,
      [userId, ids],
    );
  }
  return privateJson({ ids: await list(userId) });
}

const ToggleBody = z.object({ id: ItemId, saved: z.boolean() });

export async function PUT(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ ok: false }, { status: 401 });
  const parsed = ToggleBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  // Let an expired member remove an existing item, while additions remain a
  // membership feature even if someone bypasses the client controls.
  if (parsed.data.saved) {
    const denied = await requireDvrAccess(userId, request);
    if (denied) return denied;
  }
  await ensureFanOauthSchema();
  if (parsed.data.saved) {
    await query(
      `INSERT INTO fan_watch_list (user_id, item_ref)
       VALUES ($1, $2)
       ON CONFLICT (user_id, item_ref) DO UPDATE SET created_at = now()`,
      [userId, parsed.data.id],
    );
  } else {
    await query(
      `DELETE FROM fan_watch_list WHERE user_id = $1 AND item_ref = $2`,
      [userId, parsed.data.id],
    );
  }
  return privateJson({ ok: true });
}
