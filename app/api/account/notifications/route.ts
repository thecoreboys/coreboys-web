import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getNotificationPrefs, upsertNotificationPref } from "@/lib/community";
import { MEMBERS_BY_SLUG } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feature 5 — notification preferences (STORAGE ONLY). We persist the fan's
 * opt-in + per-member toggles. Actual push/email delivery is a follow-up;
 * the UI must only promise "we'll notify you when they go live."
 */
export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = await getNotificationPrefs(uid);
  return NextResponse.json({ prefs });
}

const PutBody = z.object({
  scope: z.string().min(1).max(64),
  liveOptIn: z.boolean(),
  minLiveMinutes: z.number().int().min(0).max(1440).optional(),
});

export async function PUT(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof PutBody>;
  try {
    body = PutBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  // scope must be 'all' or a known member slug.
  if (body.scope !== "all" && !MEMBERS_BY_SLUG[body.scope]) {
    return NextResponse.json({ error: "unknown scope" }, { status: 400 });
  }

  await upsertNotificationPref(uid, body.scope, body.liveOptIn, body.minLiveMinutes ?? 0);
  return NextResponse.json({ ok: true });
}
