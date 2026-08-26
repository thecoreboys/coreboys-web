import "server-only";

import { query } from "@/lib/db";

export const NOTIFICATION_CATEGORY_KEYS = [
  "live",
  "new_content",
  "reminders",
  "community",
  "weekly_digest",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORY_KEYS)[number];
export type NotificationChannel = "email" | "sms";

export type NotificationChannelPreference = {
  category: NotificationCategory;
  emailEnabled: boolean;
  smsEnabled: boolean;
  /** Reserved for the future push rollout. The settings API never writes it. */
  pushEnabled: false;
  updatedAt: string | null;
};

const DEFAULT_PREFERENCES: readonly NotificationChannelPreference[] =
  NOTIFICATION_CATEGORY_KEYS.map((category) => ({
    category,
    emailEnabled: false,
    smsEnabled: false,
    pushEnabled: false,
    updatedAt: null,
  }));

let schemaReady: Promise<void> | null = null;

/**
 * Additive and idempotent so a fresh environment can serve Settings before an
 * out-of-band migration runner has executed. This mirrors the account storage
 * helpers used by Watch reminders and saved workspaces.
 */
export async function ensureNotificationPreferenceSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fan_notification_channel_preferences (
        user_id       text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        category      text NOT NULL,
        email_enabled boolean NOT NULL DEFAULT false,
        sms_enabled   boolean NOT NULL DEFAULT false,
        push_enabled  boolean NOT NULL DEFAULT false,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, category),
        CONSTRAINT fan_notification_channel_category_check
          CHECK (category IN ('live', 'new_content', 'reminders', 'community', 'weekly_digest'))
      )
    `);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

type PreferenceRow = {
  category: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  updated_at: Date | string;
};

/** Returns a complete preference set, including explicit opt-out defaults. */
export async function getNotificationChannelPreferences(
  userId: string,
): Promise<NotificationChannelPreference[]> {
  await ensureNotificationPreferenceSchema();
  const result = await query<PreferenceRow>(
    `SELECT category, email_enabled, sms_enabled, updated_at
       FROM fan_notification_channel_preferences
      WHERE user_id = $1
        AND category = ANY($2::text[])`,
    [userId, [...NOTIFICATION_CATEGORY_KEYS]],
  );
  const byCategory = new Map(result.rows.map((row) => [row.category, row]));

  return DEFAULT_PREFERENCES.map((defaults) => {
    const row = byCategory.get(defaults.category);
    if (!row) return { ...defaults };
    return {
      category: defaults.category,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      // Push remains unavailable even if a future/experimental row contains a
      // value. Enabling it requires a deliberate API + product rollout.
      pushEnabled: false,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Updates exactly one channel on a row owned by `userId`. The caller obtains
 * that id from the signed session; no account identifier comes from the body.
 */
export async function setNotificationChannelPreference(
  userId: string,
  category: NotificationCategory,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<void> {
  await ensureNotificationPreferenceSchema();

  if (channel === "email") {
    await query(
      `INSERT INTO fan_notification_channel_preferences
         (user_id, category, email_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category) DO UPDATE SET
         email_enabled = EXCLUDED.email_enabled,
         updated_at = now()`,
      [userId, category, enabled],
    );
    return;
  }

  await query(
    `INSERT INTO fan_notification_channel_preferences
       (user_id, category, sms_enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, category) DO UPDATE SET
       sms_enabled = EXCLUDED.sms_enabled,
       updated_at = now()`,
    [userId, category, enabled],
  );
}
