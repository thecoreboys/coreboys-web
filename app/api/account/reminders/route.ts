import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  applyWatchReminderTombstone,
  deleteWatchReminder,
  listWatchReminders,
  listWatchReminderTombstones,
  mergeWatchReminder,
  upsertWatchReminder,
} from "@/lib/watch/reminder-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SafeHref = z.string().trim().min(1).max(2_000).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "invalid href");

const Reminder = z.object({
  id: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/),
  itemRef: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(240),
  href: SafeHref,
  startsAt: z.string().datetime({ offset: true }),
  memberSlug: z.string().trim().min(1).max(80).nullable().default(null),
  platform: z.string().trim().min(1).max(40).nullable().default(null),
  enabled: z.boolean().default(true),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

const ReminderTombstone = z.object({
  id: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/),
  deletedAt: z.string().datetime({ offset: true }),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized", items: [] }, { status: 401 });
  const [items, tombstones] = await Promise.all([
    listWatchReminders(userId),
    listWatchReminderTombstones(userId),
  ]);
  return privateJson({ items, tombstones });
}

export async function PUT(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = Reminder.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  await upsertWatchReminder(userId, parsed.data);
  return privateJson({ ok: true, item: { ...parsed.data, updatedAt: new Date().toISOString() } });
}

const MergeBody = z.object({
  items: z.array(Reminder).max(100),
  tombstones: z.array(ReminderTombstone).max(200).default([]),
});

export async function POST(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized", items: [] }, { status: 401 });
  const parsed = MergeBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  await Promise.all(parsed.data.tombstones.map((tombstone) =>
    applyWatchReminderTombstone(userId, tombstone),
  ));
  await Promise.all(parsed.data.items.map((item) => mergeWatchReminder(userId, item)));
  const [items, tombstones] = await Promise.all([
    listWatchReminders(userId),
    listWatchReminderTombstones(userId),
  ]);
  return privateJson({ items, tombstones });
}

export async function DELETE(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = z.string().min(1).max(200).safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  const deletedAt = await deleteWatchReminder(userId, parsed.data);
  return privateJson({ ok: true, tombstone: { id: parsed.data, deletedAt } });
}
