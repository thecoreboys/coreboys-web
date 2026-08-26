import { query } from "@/lib/db";

export type WatchFeedbackScope = "item" | "creator" | "platform";
export type WatchFeedbackAction =
  | "more"
  | "less"
  | "not_interested"
  | "exclude_creator"
  | "exclude_platform";

export type WatchFeedbackRow = {
  scope: WatchFeedbackScope;
  value: string;
  signal: number;
  updated_at: Date | string;
};

let ready: Promise<void> | null = null;

export async function ensureWatchFeedbackSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_feedback (
        user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        scope      text NOT NULL CHECK (scope IN ('item', 'creator', 'platform')),
        value      text NOT NULL,
        signal     smallint NOT NULL CHECK (signal BETWEEN -2 AND 1),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, scope, value)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_watch_feedback_recent_idx
        ON fan_watch_feedback (user_id, updated_at DESC)
    `);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function listWatchFeedback(userId: string): Promise<WatchFeedbackRow[]> {
  await ensureWatchFeedbackSchema();
  const result = await query<WatchFeedbackRow>(
    `SELECT scope, value, signal, updated_at
       FROM fan_watch_feedback
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 500`,
    [userId],
  );
  return result.rows;
}

export async function setWatchFeedback(
  userId: string,
  scope: WatchFeedbackScope,
  value: string,
  signal: number,
) {
  await ensureWatchFeedbackSchema();
  await query(
    `INSERT INTO fan_watch_feedback (user_id, scope, value, signal)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, scope, value) DO UPDATE SET
       signal = EXCLUDED.signal,
       updated_at = now()`,
    [userId, scope, value, signal],
  );
}

export async function clearWatchFeedback(userId: string, scope: WatchFeedbackScope, value: string) {
  await ensureWatchFeedbackSchema();
  await query(
    `DELETE FROM fan_watch_feedback WHERE user_id = $1 AND scope = $2 AND value = $3`,
    [userId, scope, value],
  );
}
