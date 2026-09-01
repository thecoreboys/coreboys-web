import "server-only";

import webpush from "web-push";
import { query } from "@/lib/db";
import { sendEmailWithResend, getResendReadiness } from "@/lib/notifications/resend";
import { socialAlertLabel } from "@/lib/social-alert";
import { socialNotificationMaxAgeMs } from "@/lib/social-event-normalization";

type DeliveryChannel = "push" | "email";
type Delivery = {
  id: string;
  channel: DeliveryChannel;
  user_id: string;
  email: string | null;
  event_id: string;
  provider: "twitch" | "youtube" | "instagram" | "tiktok" | "x";
  member_slug: string | null;
  content_type: "live" | "video" | "short" | "photo" | "post";
  title: string;
  body: string | null;
  href: string;
  artwork_url: string | null;
  attempts: number;
};
type Subscription = { endpoint: string; p256dh: string; auth: string };
type ConsentRow = {
  email: string | null;
  email_verified: boolean;
  enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  rule_enabled: boolean;
  has_active_push: boolean;
};

const MAX_DELIVERY_ATTEMPTS = 8;

function deliveryEnabled(): boolean {
  return process.env.SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED === "true";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function getSocialNotificationDeliveryReadiness() {
  const enabled = deliveryEnabled();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  const pushMissing = [
    ["VAPID_PUBLIC_KEY", publicKey],
    ["VAPID_PRIVATE_KEY", privateKey],
    ["VAPID_SUBJECT", subject],
  ].filter(([, value]) => !value?.trim()).map(([name]) => name);
  const pushInvalid: string[] = [];
  const base64Url = /^[A-Za-z0-9_-]+$/;
  if (publicKey && (!base64Url.test(publicKey) || Buffer.from(publicKey, "base64url").length !== 65)) {
    pushInvalid.push("VAPID_PUBLIC_KEY is invalid");
  }
  if (privateKey && (!base64Url.test(privateKey) || Buffer.from(privateKey, "base64url").length !== 32)) {
    pushInvalid.push("VAPID_PRIVATE_KEY is invalid");
  }
  if (subject && !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(subject)) {
    pushInvalid.push("VAPID_SUBJECT must be a mailto address");
  }
  const email = getResendReadiness();
  const pushConfigured = pushMissing.length === 0 && pushInvalid.length === 0;
  return {
    enabled,
    push: {
      configured: pushConfigured,
      ready: enabled && pushConfigured,
      missing: pushMissing,
      invalid: pushInvalid,
    },
    email: {
      configured: email.configured,
      enabled: email.enabled,
      ready: enabled && email.readyToSend,
      missing: email.missing,
      invalid: email.invalid,
    },
  };
}

async function claim(limit: number, channels: DeliveryChannel[]): Promise<Delivery[]> {
  if (channels.length === 0) return [];
  const maxAgeSeconds = Math.ceil(socialNotificationMaxAgeMs() / 1_000);
  const result = await query<Delivery>(
    `WITH terminal AS (
       UPDATE social_notification_deliveries d
          SET status='suppressed',
              last_error=CASE
                WHEN e.published_at < now()-($4::integer * interval '1 second') THEN 'stale_delivery'
                ELSE 'max_attempts_exceeded'
              END,
              available_at=now(),updated_at=now()
         FROM social_content_events e
        WHERE e.id=d.event_id
          AND d.channel=ANY($2::text[])
          AND d.status IN ('pending','failed','processing')
          AND d.available_at <= now()
          AND (
            d.attempts >= $3
            OR e.published_at < now()-($4::integer * interval '1 second')
          )
     ), ready AS (
       SELECT d.id
         FROM social_notification_deliveries d
         JOIN social_content_events e ON e.id=d.event_id
        WHERE d.channel=ANY($2::text[]) AND d.available_at <= now()
          AND d.status IN ('pending','failed','processing') AND d.attempts < $3
          AND e.published_at >= now()-($4::integer * interval '1 second')
        ORDER BY d.created_at ASC FOR UPDATE OF d SKIP LOCKED LIMIT $1
     )
     UPDATE social_notification_deliveries d
        SET status='processing',attempts=d.attempts+1,
            available_at=now()+interval '15 minutes',last_error=NULL,updated_at=now()
       FROM ready, social_content_events e, fan_users u
      WHERE d.id=ready.id AND e.id=d.event_id AND u.id=d.user_id
      RETURNING d.id::text,d.channel,d.user_id,u.email,e.id::text AS event_id,
                e.provider,e.member_slug,e.content_type,e.title,e.body,e.href,e.artwork_url,d.attempts`,
    [Math.min(100, Math.max(1, limit)), channels, MAX_DELIVERY_ATTEMPTS, maxAgeSeconds],
  );
  return result.rows;
}

async function completed(id: string): Promise<void> {
  await query(
    `UPDATE social_notification_deliveries
        SET status='sent',delivered_at=now(),available_at=now(),last_error=NULL,updated_at=now()
      WHERE id=$1 AND status='processing'`,
    [id],
  );
}

async function suppressed(id: string, reason: string): Promise<void> {
  await query(
    `UPDATE social_notification_deliveries
        SET status='suppressed',last_error=LEFT($2,500),available_at=now(),updated_at=now()
      WHERE id=$1 AND status='processing'`,
    [id, reason],
  );
}

async function failed(row: Delivery, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "delivery failed";
  if (row.attempts >= MAX_DELIVERY_ATTEMPTS) {
    await suppressed(row.id, `max_attempts_exceeded: ${message}`);
    return;
  }
  await query(
    `UPDATE social_notification_deliveries
        SET status='failed',available_at=now()+LEAST(attempts,12)*interval '5 minutes',
            last_error=LEFT($2,500),updated_at=now()
      WHERE id=$1 AND status='processing'`,
    [row.id, message],
  );
}

async function consentFor(row: Delivery): Promise<{ allowed: boolean; email: string | null; reason: string }> {
  const result = await query<ConsentRow>(
    `SELECT u.email,u.email_verified,
            COALESCE(s.enabled,true) AS enabled,
            COALESCE(s.push_enabled,false) AS push_enabled,
            COALESCE(s.email_enabled,false) AS email_enabled,
            COALESCE(r.enabled,true) AS rule_enabled,
            EXISTS (
              SELECT 1 FROM web_push_subscriptions p
               WHERE p.user_id=u.id AND (p.expiration_time IS NULL OR p.expiration_time > now())
            ) AS has_active_push
       FROM fan_users u
       LEFT JOIN fan_social_notification_settings s ON s.user_id=u.id
       LEFT JOIN fan_social_notification_rules r
         ON r.user_id=u.id AND r.member_slug=$2 AND r.content_type=$3
      WHERE u.id=$1`,
    [row.user_id, row.member_slug ?? "core", row.content_type],
  );
  const consent = result.rows[0];
  if (!consent) return { allowed: false, email: null, reason: "account_removed" };
  if (!consent.enabled || !consent.rule_enabled) {
    return { allowed: false, email: consent.email, reason: "notification_preference_disabled" };
  }
  if (row.channel === "push") {
    if (!consent.push_enabled) return { allowed: false, email: consent.email, reason: "push_preference_disabled" };
    if (!consent.has_active_push) return { allowed: false, email: consent.email, reason: "no_active_push_subscription" };
  } else {
    if (!consent.email_enabled) return { allowed: false, email: consent.email, reason: "email_preference_disabled" };
    if (!consent.email_verified || !consent.email) {
      return { allowed: false, email: consent.email, reason: "email_not_verified" };
    }
  }
  return { allowed: true, email: consent.email, reason: "allowed" };
}

async function sendPush(row: Delivery): Promise<boolean> {
  const readiness = getSocialNotificationDeliveryReadiness();
  if (!readiness.push.configured) throw new Error("VAPID not configured");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const subscriptions = await query<Subscription>(
    `SELECT endpoint,p256dh,auth FROM web_push_subscriptions
      WHERE user_id=$1 AND (expiration_time IS NULL OR expiration_time > now())`,
    [row.user_id],
  );
  if (subscriptions.rows.length === 0) return false;
  const payload = JSON.stringify({
    eventId: row.event_id,
    href: row.href,
    title: socialAlertLabel({ contentType: row.content_type, provider: row.provider }),
    body: row.title,
    previewBody: row.body,
    artworkUrl: row.artwork_url,
    provider: row.provider,
    contentType: row.content_type,
    tag: `core-${row.event_id}`,
  });
  const outcomes = await Promise.all(subscriptions.rows.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        { TTL: 300, urgency: row.content_type === "live" ? "high" : "normal" },
      );
      return { sent: true, error: null as unknown };
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
      if (status === 404 || status === 410) {
        await query(`DELETE FROM web_push_subscriptions WHERE endpoint=$1`, [subscription.endpoint]);
        return { sent: false, error: null as unknown };
      }
      return { sent: false, error };
    }
  }));
  if (outcomes.some((outcome) => outcome.sent)) return true;
  const transientError = outcomes.find((outcome) => outcome.error)?.error;
  if (transientError) throw transientError;
  return false;
}

async function sendEmail(row: Delivery): Promise<void> {
  if (!row.email) throw new Error("verified email missing");
  const label = socialAlertLabel({ contentType: row.content_type, provider: row.provider });
  const url = new URL(row.href, process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com").toString();
  await sendEmailWithResend({
    to: row.email,
    subject: `${label}: ${row.title}`,
    text: `${row.title}\n\n${row.body ?? ""}\n\n${url}`,
    html: `<h1>${escapeHtml(row.title)}</h1><p>${escapeHtml(row.body ?? "")}</p><p><a href="${escapeHtml(url)}">Open on CORE</a></p>`,
    idempotencyKey: `social-event-${row.event_id}-${row.user_id}`,
  });
}

export async function drainSocialNotificationDeliveries(limit = 50) {
  const readiness = getSocialNotificationDeliveryReadiness();
  if (!readiness.enabled) {
    return { enabled: false, sent: 0, failed: 0, skipped: 0, claimed: 0, readyChannels: [] as DeliveryChannel[] };
  }
  const readyChannels: DeliveryChannel[] = [];
  if (readiness.push.ready) readyChannels.push("push");
  if (readiness.email.ready) readyChannels.push("email");
  const rows = await claim(limit, readyChannels);
  let sent = 0;
  let failures = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const consent = await consentFor(row);
      if (!consent.allowed) {
        await suppressed(row.id, consent.reason);
        skipped += 1;
        continue;
      }
      row.email = consent.email;
      if (row.channel === "push") {
        const delivered = await sendPush(row);
        if (!delivered) {
          await suppressed(row.id, "no_active_push_subscription");
          skipped += 1;
          continue;
        }
      } else {
        await sendEmail(row);
      }
      await completed(row.id);
      sent += 1;
    } catch (error) {
      await failed(row, error);
      failures += 1;
    }
  }
  return { enabled: true, sent, failed: failures, skipped, claimed: rows.length, readyChannels };
}
