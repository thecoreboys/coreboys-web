import "server-only";

import { query } from "@/lib/db";
import type {
  FanNotificationEvent,
  FanNotificationProvider,
} from "@/lib/fanzone-notifications";
import { drainFanNotificationOutbox } from "@/lib/fanzone-notifications";
import {
  ensureNotificationPreferenceSchema,
  type NotificationCategory,
} from "@/lib/notification-preferences";
import { renderFanNotificationEmail } from "./fan-email-template";
import { getResendReadiness, sendEmailWithResend } from "./resend";

const EVENT_CATEGORY: Record<FanNotificationEvent, NotificationCategory> = {
  "fan_submission.approved": "community",
  "fan_submission.denied": "community",
  "fanzone.community_update": "community",
  "fanzone.community_live": "live",
  "fanzone.weekly_digest": "weekly_digest",
};

async function findVerifiedOptedInRecipient(
  userId: string,
  category: NotificationCategory,
): Promise<string | null> {
  await ensureNotificationPreferenceSchema();
  const result = await query<{ email: string }>(
    `SELECT users.email
       FROM fan_users users
       JOIN fan_notification_channel_preferences preferences
         ON preferences.user_id = users.id
        AND preferences.category = $2
      WHERE users.id = $1
        AND users.email_verified = true
        AND preferences.email_enabled = true
      LIMIT 1`,
    [userId, category],
  );
  return result.rows[0]?.email?.trim().toLowerCase() || null;
}

/**
 * Opt-in-gated adapter for the existing FanZone outbox.
 *
 * This factory does not start a worker or send on import. A future, explicit
 * worker may pass it to drainFanNotificationOutbox(). Recipients without a
 * verified email and a true per-category email preference are consumed without
 * contacting Resend, so switching a preference on later never delivers stale
 * moderation events.
 */
export function createResendFanNotificationProvider(): FanNotificationProvider {
  return {
    name: "resend-email",
    async send(message) {
      const category = EVENT_CATEGORY[message.eventType];
      const recipient = await findVerifiedOptedInRecipient(message.userId, category);
      if (!recipient) return;

      const rendered = renderFanNotificationEmail({
        eventType: message.eventType,
        payload: message.payload,
        siteOrigin: process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com",
      });
      await sendEmailWithResend({
        to: recipient,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        idempotencyKey: `fan-notification-${message.id}`,
      });
    },
  };
}

export const getFanEmailDeliveryReadiness = getResendReadiness;

/**
 * The explicit bridge to the existing provider-neutral outbox. Nothing calls
 * this automatically: a protected scheduler must opt into it. The kill switch
 * is checked before records are claimed, so a disabled deployment leaves its
 * queue untouched.
 */
export async function drainResendFanNotificationOutbox(
  limit = 25,
): Promise<{ enabled: boolean; sent: number; failed: number }> {
  if (!getResendReadiness().readyToSend) {
    return { enabled: false, sent: 0, failed: 0 };
  }
  const result = await drainFanNotificationOutbox(
    createResendFanNotificationProvider(),
    limit,
  );
  return { enabled: true, ...result };
}
