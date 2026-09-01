import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  getNotificationCenterPage,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
  deleteInboxNotification,
} from "@/lib/notification-center";
import { INBOX_CATEGORIES, isInboxCategory } from "@/lib/inbox-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_read"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("mark_all_read"), category: z.enum(INBOX_CATEGORIES).optional() }).strict(),
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
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "30");
  const categoryValue = url.searchParams.get("category");
  if (categoryValue && !isInboxCategory(categoryValue)) return privateJson({ error: "invalid_category" }, { status: 400 });
  const category = isInboxCategory(categoryValue) ? categoryValue : null;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
    return privateJson({ error: "invalid_limit" }, { status: 400 });
  }
  return privateJson(await getNotificationCenterPage({
    userId,
    category,
    cursor: url.searchParams.get("cursor"),
    limit: requestedLimit,
  }));
}

export async function PATCH(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid_payload" }, { status: 400 });
  if (parsed.data.action === "mark_read") {
    return privateJson({ ok: await markInboxNotificationRead(userId, parsed.data.id) });
  }
  if (parsed.data.action === "delete") {
    return privateJson({ ok: await deleteInboxNotification(userId, parsed.data.id) });
  }
  const changed = await markAllInboxNotificationsRead(userId, parsed.data.category ?? null);
  return privateJson({ ok: true, changed });
}
