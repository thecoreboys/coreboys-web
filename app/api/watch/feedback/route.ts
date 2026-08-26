import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { clearWatchFeedback, setWatchFeedback } from "@/lib/watch/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["more", "less", "not_interested", "exclude_creator", "exclude_platform", "reset"]),
  key: z.string().min(1).max(240).optional(),
  memberSlug: z.string().min(1).max(80).optional(),
  platform: z.string().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const body = parsed.data;
  const scope = body.action === "exclude_creator"
    ? "creator"
    : body.action === "exclude_platform"
      ? "platform"
      : "item";
  const value = scope === "creator" ? body.memberSlug : scope === "platform" ? body.platform : body.key;
  if (!value) return NextResponse.json({ error: "missing_target" }, { status: 400 });
  if (body.action === "reset") await clearWatchFeedback(userId, scope, value);
  else {
    const signal = body.action === "more" ? 1 : body.action === "less" ? -1 : -2;
    await setWatchFeedback(userId, scope, value, signal);
  }
  return NextResponse.json({ ok: true, action: body.action, scope, value });
}
