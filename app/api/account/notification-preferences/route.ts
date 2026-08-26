import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  getNotificationChannelPreferences,
  NOTIFICATION_CATEGORY_KEYS,
  setNotificationChannelPreference,
} from "@/lib/notification-preferences";
import {
  EntitlementDeniedError,
  requireAccountEntitlement,
} from "@/lib/subscriptions/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateBody = z
  .object({
    category: z.enum(NOTIFICATION_CATEGORY_KEYS),
    channel: z.enum(["email", "sms"]),
    enabled: z.boolean(),
  })
  .strict();

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function entitlementDenied(error: unknown) {
  if (!(error instanceof EntitlementDeniedError)) throw error;
  return privateJson(
    {
      error: error.code,
      featureId: error.featureId,
      requiredPlanId: error.requiredPlanId,
      upgradeHref: `/upgrade?feature=${encodeURIComponent(error.featureId)}`,
    },
    { status: 403 },
  );
}

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) {
    return privateJson({ error: "unauthorized", preferences: [] }, { status: 401 });
  }

  return privateJson({
    preferences: await getNotificationChannelPreferences(userId),
    delivery: {
      email: "preference_only",
      sms: "preference_only",
      push: "coming_soon",
    },
  });
}

export async function PUT(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });

  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson({ error: "invalid_payload" }, { status: 400 });
  }

  const { category, channel, enabled } = parsed.data;
  // Live alerts, new-content alerts, reminders, and community preferences are
  // part of the free settings baseline. The scheduled weekly digest is the
  // only advanced-notification utility in this endpoint.
  if (category === "weekly_digest") {
    try {
      await requireAccountEntitlement({
        userId,
        requestHostname: new URL(request.url).hostname,
        featureId: "notifications.advanced",
      });
    } catch (error) {
      return entitlementDenied(error);
    }
  }

  await setNotificationChannelPreference(userId, category, channel, enabled);
  const updated = (await getNotificationChannelPreferences(userId)).find(
    (preference) => preference.category === category,
  );

  return privateJson({ ok: true, preference: updated });
}
