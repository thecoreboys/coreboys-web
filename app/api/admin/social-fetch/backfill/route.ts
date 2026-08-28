import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  getSocialFetchBackfillStatus,
  pauseSocialFetchBackfill,
  resumeSocialFetchBackfill,
  startSocialFetchBackfill,
} from "@/lib/social-fetch-backfill";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MaxCredits = z.number().int().min(1).max(100_000);

const StartBody = z.object({
  maxCredits: MaxCredits.default(1_000),
}).strict();

const UpdateBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause") }).strict(),
  z.object({
    action: z.literal("resume"),
    maxCredits: MaxCredits.optional(),
  }).strict(),
]);

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function operationError(error: unknown) {
  const code = error instanceof Error ? error.message : "social_fetch_backfill_unavailable";
  if (
    code === "social_fetch_backfill_active"
    || code === "social_fetch_backfill_not_running"
    || code === "social_fetch_backfill_not_paused"
    || code === "social_fetch_backfill_worker_active"
    || code === "social_fetch_backfill_worker_active"
  ) {
    return privateJson({ error: "The history import state changed. Refresh the private controls and try again." }, 409);
  }
  if (code.startsWith("invalid_social_fetch_") || code === "social_fetch_backfill_cap_below_usage") {
    return privateJson({ error: "Enter a whole-number import cap that is not below credits already committed." }, 400);
  }
  return privateJson({ error: "Social Fetch history controls are unavailable. Apply migration 044 first." }, 503);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return privateJson({ backfill: await getSocialFetchBackfillStatus() });
  } catch (error) {
    return operationError(error);
  }
}

/** Start one fixed six-calendar-month import. It never starts on page load. */
export async function POST(request: NextRequest) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = StartBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson({ error: "Enter a whole-number import cap from 1 to 100,000 credits." }, 400);
  }
  try {
    const backfill = await startSocialFetchBackfill({
      actorId: auth.id,
      months: 6,
      maxCredits: parsed.data.maxCredits,
    });
    return privateJson({ backfill }, 201);
  } catch (error) {
    return operationError(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid origin" }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "Choose pause or resume and use a valid credit cap." }, 400);
  try {
    const backfill = parsed.data.action === "pause"
      ? await pauseSocialFetchBackfill({ actorId: auth.id })
      : await resumeSocialFetchBackfill({
          actorId: auth.id,
          maxCredits: parsed.data.maxCredits,
        });
    return privateJson({ backfill });
  } catch (error) {
    return operationError(error);
  }
}
