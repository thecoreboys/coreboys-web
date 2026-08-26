import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { performXNativeAction } from "@/lib/x/actions";
import { requestHasSameOrigin, verifyXActionCsrfToken } from "@/lib/x/security";
import { X_ACTION_KINDS } from "@/lib/x/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(X_ACTION_KINDS),
  postId: z.string().regex(/^\d{5,25}$/).optional(),
  targetUserId: z.string().regex(/^\d{5,25}$/).optional(),
  text: z.string().trim().min(1).max(280).optional(),
  confirmation: z.literal(true),
}).strict();

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return json({ ok: false, error: "Invalid request origin." }, 403);
  const userId = await getCurrentFanUserId();
  if (!userId) return json({ ok: false, error: "Sign in to use your X account." }, 401);
  const csrf = request.headers.get("x-csrf-token") ?? "";
  if (!await verifyXActionCsrfToken(csrf, userId)) return json({ ok: false, error: "Refresh the page and confirm again." }, 403);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9:_-]{16,120}$/.test(idempotencyKey)) {
    return json({ ok: false, error: "A valid action key is required." }, 400);
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Invalid or unconfirmed X action." }, 400);
  try {
    const { result, httpStatus } = await performXNativeAction(userId, parsed.data, idempotencyKey);
    const response = json(result, httpStatus);
    if (result.retryAfterSeconds) response.headers.set("Retry-After", String(result.retryAfterSeconds));
    return response;
  } catch {
    return json({ ok: false, error: "X actions are temporarily unavailable." }, 503);
  }
}
