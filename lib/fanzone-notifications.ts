import { query, withTransaction } from "@/lib/db";
import { ensureFanzoneSchema } from "@/lib/fanzone";
import { fanNotificationInboxDetails, recordInboxNotification } from "@/lib/notification-center";

export type FanNotificationEvent =
  | "fan_submission.approved"
  | "fan_submission.denied"
  | "fanzone.community_update"
  | "fanzone.community_live"
  | "fanzone.weekly_digest";

export type FanNotificationMessage = {
  id: string;
  userId: string;
  eventType: FanNotificationEvent;
  payload: Record<string, unknown>;
};

/** Adapter boundary for a future email, push, or in-app delivery provider. */
export interface FanNotificationProvider {
  readonly name: string;
  send(message: FanNotificationMessage): Promise<void>;
}

/** Idempotently records an event without coupling moderation to a vendor. */
export async function queueFanNotification(
  userId: string,
  eventType: FanNotificationEvent,
  dedupeKey: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  await ensureFanzoneSchema();
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO fan_notification_outbox (user_id, event_type, dedupe_key, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (event_type, dedupe_key) DO NOTHING`,
      [userId, eventType, dedupeKey, JSON.stringify(payload)],
    );
    if ((result.rowCount ?? 0) === 0) return false;
    const details = fanNotificationInboxDetails(eventType, payload);
    await recordInboxNotification({
      userId,
      sourceKey: `fanzone:${eventType}:${dedupeKey}`,
      ...details,
    }, client);
    return true;
  });
}

/**
 * Provider-neutral worker hook. A scheduled job can pass its provider adapter;
 * stalled claims automatically become eligible again after fifteen minutes.
 */
export async function drainFanNotificationOutbox(
  provider: FanNotificationProvider,
  limit = 25,
): Promise<{ sent: number; failed: number }> {
  await ensureFanzoneSchema();
  const claimed = await query<{
    id: string;
    user_id: string;
    event_type: FanNotificationEvent;
    payload: Record<string, unknown>;
  }>(
    `WITH ready AS (
       SELECT id
         FROM fan_notification_outbox
        WHERE (
          status IN ('pending','failed')
          OR (status = 'processing' AND available_at <= now())
        )
          AND available_at <= now()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE fan_notification_outbox outbox
        SET status = 'processing',
            attempts = attempts + 1,
            available_at = now() + interval '15 minutes',
            last_error = NULL
       FROM ready
      WHERE outbox.id = ready.id
      RETURNING outbox.id::text, outbox.user_id, outbox.event_type, outbox.payload`,
    [Math.min(100, Math.max(1, limit))],
  );

  let sent = 0;
  let failed = 0;
  for (const row of claimed.rows) {
    try {
      await provider.send({
        id: row.id,
        userId: row.user_id,
        eventType: row.event_type,
        payload: row.payload,
      });
      await query(
        `UPDATE fan_notification_outbox
            SET status = 'sent', processed_at = now(), available_at = now()
          WHERE id = $1 AND status = 'processing'`,
        [row.id],
      );
      sent += 1;
    } catch (error) {
      await query(
        `UPDATE fan_notification_outbox
            SET status = 'failed',
                available_at = now() + LEAST(attempts, 12) * interval '5 minutes',
                last_error = LEFT($2, 500)
          WHERE id = $1 AND status = 'processing'`,
        [row.id, error instanceof Error ? error.message : "Provider delivery failed"],
      );
      failed += 1;
    }
  }
  return { sent, failed };
}
