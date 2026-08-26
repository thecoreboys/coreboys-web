-- Account-scoped reminders for scheduled Watch / Guide programs.
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
);

CREATE INDEX IF NOT EXISTS fan_watch_reminders_upcoming_idx
  ON fan_watch_reminders (user_id, enabled, starts_at);
