import "server-only";

import { query } from "@/lib/db";

export type StoredWatchReminder = {
  id: string;
  itemRef: string;
  title: string;
  href: string;
  startsAt: string;
  memberSlug: string | null;
  platform: string | null;
  enabled: boolean;
  updatedAt: string;
};

export type StoredWatchReminderTombstone = {
  id: string;
  deletedAt: string;
};

let ready: Promise<void> | null = null;

export async function ensureWatchReminderSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_reminders (
        user_id      text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        reminder_id  text NOT NULL,
        item_ref     text NOT NULL,
        title        text NOT NULL,
        href         text NOT NULL,
        starts_at    timestamptz NOT NULL,
        member_slug  text,
        platform     text,
        enabled      boolean NOT NULL DEFAULT true,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, reminder_id)
      )
    `);
    await query(`
      ALTER TABLE fan_watch_reminders
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_watch_reminders_upcoming_idx
        ON fan_watch_reminders (user_id, enabled, starts_at)
    `);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function toReminder(row: {
  reminder_id: string;
  item_ref: string;
  title: string;
  href: string;
  starts_at: Date | string;
  member_slug: string | null;
  platform: string | null;
  enabled: boolean;
  updated_at: Date | string;
}): StoredWatchReminder {
  return {
    id: row.reminder_id,
    itemRef: row.item_ref,
    title: row.title,
    href: row.href,
    startsAt: new Date(row.starts_at).toISOString(),
    memberSlug: row.member_slug,
    platform: row.platform,
    enabled: row.enabled,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listWatchReminders(userId: string): Promise<StoredWatchReminder[]> {
  await ensureWatchReminderSchema();
  const result = await query<{
    reminder_id: string;
    item_ref: string;
    title: string;
    href: string;
    starts_at: Date | string;
    member_slug: string | null;
    platform: string | null;
    enabled: boolean;
    updated_at: Date | string;
  }>(
    `SELECT reminder_id, item_ref, title, href, starts_at, member_slug, platform, enabled, updated_at
       FROM fan_watch_reminders
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND starts_at > now() - interval '12 hours'
      ORDER BY starts_at ASC
      LIMIT 100`,
    [userId],
  );
  return result.rows.map(toReminder);
}

export async function listWatchReminderTombstones(
  userId: string,
): Promise<StoredWatchReminderTombstone[]> {
  await ensureWatchReminderSchema();
  const result = await query<{ reminder_id: string; deleted_at: Date | string }>(
    `SELECT reminder_id, deleted_at
       FROM fan_watch_reminders
      WHERE user_id = $1
        AND deleted_at IS NOT NULL
        AND deleted_at > now() - interval '90 days'
      ORDER BY deleted_at DESC
      LIMIT 200`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.reminder_id,
    deletedAt: new Date(row.deleted_at).toISOString(),
  }));
}

export async function upsertWatchReminder(
  userId: string,
  reminder: Omit<StoredWatchReminder, "updatedAt">,
): Promise<void> {
  await ensureWatchReminderSchema();
  await query(
    `INSERT INTO fan_watch_reminders
       (user_id, reminder_id, item_ref, title, href, starts_at, member_slug, platform, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id, reminder_id) DO UPDATE SET
       item_ref = EXCLUDED.item_ref,
       title = EXCLUDED.title,
       href = EXCLUDED.href,
       starts_at = EXCLUDED.starts_at,
       member_slug = EXCLUDED.member_slug,
       platform = EXCLUDED.platform,
       enabled = EXCLUDED.enabled,
        updated_at = now(),
        deleted_at = NULL`,
    [
      userId,
      reminder.id,
      reminder.itemRef,
      reminder.title,
      reminder.href,
      reminder.startsAt,
      reminder.memberSlug,
      reminder.platform,
      reminder.enabled,
    ],
  );
}

export async function mergeWatchReminder(
  userId: string,
  reminder: Omit<StoredWatchReminder, "updatedAt"> & { updatedAt?: string },
): Promise<void> {
  await ensureWatchReminderSchema();
  const parsedTimestamp = Date.parse(reminder.updatedAt ?? "");
  const clientUpdatedAt = Number.isFinite(parsedTimestamp) && parsedTimestamp <= Date.now() + 5 * 60_000
    ? new Date(parsedTimestamp).toISOString()
    : null;
  await query(
    `INSERT INTO fan_watch_reminders
       (user_id, reminder_id, item_ref, title, href, starts_at, member_slug, platform, enabled, updated_at, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz, now()),NULL)
     ON CONFLICT (user_id, reminder_id) DO UPDATE SET
       item_ref = EXCLUDED.item_ref,
       title = EXCLUDED.title,
       href = EXCLUDED.href,
       starts_at = EXCLUDED.starts_at,
       member_slug = EXCLUDED.member_slug,
       platform = EXCLUDED.platform,
       enabled = EXCLUDED.enabled,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL
     WHERE (
       fan_watch_reminders.deleted_at IS NULL
       AND ($10::timestamptz IS NULL OR EXCLUDED.updated_at >= fan_watch_reminders.updated_at)
     ) OR (
       fan_watch_reminders.deleted_at IS NOT NULL
       AND $10::timestamptz IS NOT NULL
       AND EXCLUDED.updated_at > fan_watch_reminders.deleted_at
     )`,
    [
      userId,
      reminder.id,
      reminder.itemRef,
      reminder.title,
      reminder.href,
      reminder.startsAt,
      reminder.memberSlug,
      reminder.platform,
      reminder.enabled,
      clientUpdatedAt,
    ],
  );
}

export async function deleteWatchReminder(userId: string, reminderId: string): Promise<string> {
  await ensureWatchReminderSchema();
  const result = await query<{ deleted_at: Date | string }>(
    `UPDATE fan_watch_reminders
        SET enabled = false, deleted_at = now(), updated_at = now()
      WHERE user_id = $1 AND reminder_id = $2
      RETURNING deleted_at`,
    [userId, reminderId],
  );
  return new Date(result.rows[0]?.deleted_at ?? Date.now()).toISOString();
}

export async function applyWatchReminderTombstone(
  userId: string,
  tombstone: StoredWatchReminderTombstone,
): Promise<void> {
  await ensureWatchReminderSchema();
  const parsedTimestamp = Date.parse(tombstone.deletedAt);
  if (!Number.isFinite(parsedTimestamp) || parsedTimestamp > Date.now() + 5 * 60_000) return;
  const deletedAt = new Date(parsedTimestamp).toISOString();
  await query(
    `UPDATE fan_watch_reminders
        SET enabled = false,
            deleted_at = $3::timestamptz,
            updated_at = GREATEST(updated_at, $3::timestamptz)
      WHERE user_id = $1
        AND reminder_id = $2
        AND updated_at <= $3::timestamptz
        AND (deleted_at IS NULL OR deleted_at < $3::timestamptz)`,
    [userId, tombstone.id, deletedAt],
  );
}
