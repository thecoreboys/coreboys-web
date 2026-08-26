-- Explicit, account-scoped notification delivery preferences.
-- All channels default off; no delivery worker is activated by this migration.
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
);
