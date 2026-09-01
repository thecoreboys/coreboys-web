import "server-only";

import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { ensureWatchReminderSchema } from "@/lib/watch/reminder-store";
import {
  type InboxCategory,
  type InboxNotification,
  type NotificationCenterPage,
} from "@/lib/inbox-notification";

type Queryable = Pick<PoolClient, "query">;

export type InboxNotificationDraft = {
  userId: string;
  category: InboxCategory;
  sourceKey: string;
  title: string;
  body?: string | null;
  href: string;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  createdAt?: Date | string;
};

type NotificationRow = {
  id: string;
  category: InboxCategory;
  title: string;
  body: string | null;
  href: string;
  image_url: string | null;
  avatar_url: string | null;
  created_at: string;
  read_at: string | null;
};

type Cursor = { createdAt: string; id: string };

function text(value: string, maximum: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maximum);
}

function safeHref(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed.slice(0, 2_000);
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString().slice(0, 2_000);
  } catch {
    // The account page is a safe destination for a malformed source link.
  }
  return "/account";
}

function safeImage(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString().slice(0, 2_000) : null;
  } catch {
    return null;
  }
}

function mapRow(row: NotificationRow): InboxNotification {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    href: row.href,
    imageUrl: row.image_url,
    avatarUrl: row.avatar_url,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value?: string | null): Cursor | null {
  if (!value || value.length > 400) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (
      typeof parsed.createdAt !== "string"
      || !Number.isFinite(Date.parse(parsed.createdAt))
      || typeof parsed.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(parsed.id)
    ) return null;
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

export async function recordInboxNotification(
  draft: InboxNotificationDraft,
  client?: Queryable,
): Promise<boolean> {
  const executor = client ?? { query };
  const result = await executor.query(
    `INSERT INTO fan_inbox_notifications
       (user_id,category,source_key,title,body,href,image_url,avatar_url,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,now()))
     ON CONFLICT (user_id,source_key) DO NOTHING`,
    [
      draft.userId,
      draft.category,
      text(draft.sourceKey, 500),
      text(draft.title, 240) || "CORE update",
      draft.body ? text(draft.body, 500) || null : null,
      safeHref(draft.href),
      safeImage(draft.imageUrl),
      safeImage(draft.avatarUrl),
      draft.createdAt ? new Date(draft.createdAt).toISOString() : null,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getNotificationCenterPage(input: {
  userId: string;
  category?: InboxCategory | null;
  cursor?: string | null;
  limit?: number;
}): Promise<NotificationCenterPage> {
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit ?? 30)));
  const cursor = decodeCursor(input.cursor);
  // Reminders deliberately become inbox items only when the user has CORE
  // open around their start time. There is no new scheduler or external
  // delivery worker behind this convenience surface.
  await ensureWatchReminderSchema();
  await query(
    `INSERT INTO fan_inbox_notifications
       (user_id,category,source_key,title,body,href,created_at)
     SELECT user_id,
            'reminder',
            'reminder:' || reminder_id || ':' || starts_at::text,
            title || ' starts soon',
            'From your saved Guide reminders.',
            href,
            now()
       FROM fan_watch_reminders
      WHERE user_id=$1
        AND enabled=true
        AND deleted_at IS NULL
        AND starts_at BETWEEN now()-interval '30 minutes' AND now()+interval '10 minutes'
     ON CONFLICT (user_id,source_key) DO NOTHING`,
    [input.userId],
  );
  const [notifications, unread] = await Promise.all([
    query<NotificationRow>(
      `SELECT id::text,category,title,body,href,image_url,avatar_url,created_at::text,read_at::text
         FROM fan_inbox_notifications
        WHERE user_id=$1
          AND ($2::text IS NULL OR category=$2)
          AND (
            $3::timestamptz IS NULL
            OR created_at < $3::timestamptz
            OR (created_at = $3::timestamptz AND id < $4::uuid)
          )
        ORDER BY created_at DESC,id DESC
        LIMIT $5`,
      [input.userId, input.category ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM fan_inbox_notifications
        WHERE user_id=$1 AND read_at IS NULL`,
      [input.userId],
    ),
  ]);
  const rows = notifications.rows;
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(mapRow);
  const last = items.at(-1);
  return {
    items,
    unreadCount: Math.max(0, Number(unread.rows[0]?.count ?? 0)),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

export async function markInboxNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await query(
    `UPDATE fan_inbox_notifications
        SET read_at=COALESCE(read_at,now()),updated_at=now()
      WHERE id=$1 AND user_id=$2`,
    [notificationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteInboxNotification(userId: string, notificationId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM fan_inbox_notifications WHERE id=$1 AND user_id=$2`,
    [notificationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllInboxNotificationsRead(userId: string, category?: InboxCategory | null): Promise<number> {
  const result = await query(
    `UPDATE fan_inbox_notifications
        SET read_at=now(),updated_at=now()
      WHERE user_id=$1 AND read_at IS NULL AND ($2::text IS NULL OR category=$2)`,
    [userId, category ?? null],
  );
  return result.rowCount ?? 0;
}

export function fanNotificationInboxDetails(eventType: string, payload: Record<string, unknown>): Omit<InboxNotificationDraft, "userId" | "sourceKey"> {
  const payloadText = (key: string, maximum: number) => typeof payload[key] === "string"
    ? text(payload[key] as string, maximum)
    : "";
  const communityName = payloadText("communityName", 80) || "your CORE community";
  const href = safeHref(payloadText("href", 2_000) || (eventType.startsWith("fanzone.") ? "/fanzone#communities" : "/account"));
  if (eventType === "fan_submission.approved") {
    return {
      category: "account",
      title: "Your Fan Zone submission was approved",
      body: "Your submission can now appear in the CORE Fan Zone.",
      href,
    };
  }
  if (eventType === "fan_submission.denied") {
    const reason = payloadText("denialReason", 300);
    return {
      category: "account",
      title: "Your Fan Zone submission was reviewed",
      body: reason ? `Review note: ${reason}` : "Your submission was not approved this time.",
      href,
    };
  }
  if (eventType === "fanzone.community_live") {
    return { category: "community", title: `${communityName} is live`, body: "A community live event is happening now.", href };
  }
  if (eventType === "fanzone.weekly_digest") {
    return { category: "community", title: `Your ${communityName} weekly recap is ready`, body: "See what happened in your community this week.", href };
  }
  return {
    category: "community",
    title: payloadText("title", 240) || `New update from ${communityName}`,
    body: `A staff-published update is available in ${communityName}.`,
    href,
  };
}
