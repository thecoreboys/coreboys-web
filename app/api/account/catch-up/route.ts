import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { CATCH_UP_KEY_PATTERN } from "@/lib/catch-up";
import {
  getCatchUp,
  getCatchUpSummary,
  markAllCatchUpSeen,
  markCatchUpItemsSeen,
} from "@/lib/catch-up-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_seen"),
    keys: z.array(z.string().regex(CATCH_UP_KEY_PATTERN)).min(1).max(200),
  }).strict(),
  z.object({
    action: z.literal("mark_all_seen"),
    through: z.string().datetime({ offset: true }),
  }).strict(),
]);

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const summary = new URL(request.url).searchParams.get("summary") === "1";
  try {
    return privateJson(summary ? await getCatchUpSummary(userId) : await getCatchUp(userId));
  } catch {
    return privateJson({ error: "catch_up_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });
  if (parsed.data.action === "mark_seen") {
    return privateJson({ ok: true, changed: await markCatchUpItemsSeen(userId, parsed.data.keys) });
  }
  return privateJson({ ok: await markAllCatchUpSeen(userId, new Date(parsed.data.through)) });
}
