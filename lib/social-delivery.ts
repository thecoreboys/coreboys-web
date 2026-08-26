import "server-only";
import webpush from "web-push";
import { query } from "@/lib/db";
import { sendEmailWithResend, getResendReadiness } from "@/lib/notifications/resend";
import { socialAlertLabel } from "@/lib/social-alert";

type Delivery = { id: string; channel: "push" | "email"; user_id: string; email: string | null; event_id: string; provider: "twitch" | "youtube" | "instagram" | "tiktok" | "x"; member_slug: string | null; content_type: "live" | "video" | "short" | "photo" | "post"; title: string; body: string | null; href: string; artwork_url: string | null };
type Subscription = { endpoint: string; p256dh: string; auth: string };

function pushConfigured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }
function deliveryEnabled() { return process.env.SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED === "true"; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c); }

async function claim(limit: number) {
  return query<Delivery>(
    `WITH ready AS (
       SELECT id FROM social_notification_deliveries
        WHERE channel IN ('push','email') AND available_at <= now()
          AND (status IN ('pending','failed') OR (status='processing' AND available_at < now() - interval '15 minutes'))
        ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $1
     ) UPDATE social_notification_deliveries d
        SET status='processing',attempts=attempts+1,available_at=now()+interval '15 minutes',last_error=NULL,updated_at=now()
       FROM ready JOIN social_content_events e ON e.id=d.event_id JOIN fan_users u ON u.id=d.user_id
      WHERE d.id=ready.id
      RETURNING d.id::text,d.channel,d.user_id,u.email,e.id::text AS event_id,e.provider,e.member_slug,e.content_type,e.title,e.body,e.href,e.artwork_url`,
    [Math.min(100, Math.max(1, limit))],
  );
}
async function completed(id: string) { await query(`UPDATE social_notification_deliveries SET status='sent',delivered_at=now(),available_at=now(),updated_at=now() WHERE id=$1 AND status='processing'`, [id]); }
async function failed(id: string, error: unknown) { await query(`UPDATE social_notification_deliveries SET status='failed',available_at=now()+LEAST(attempts,12)*interval '5 minutes',last_error=LEFT($2,500),updated_at=now() WHERE id=$1 AND status='processing'`, [id, error instanceof Error ? error.message : "delivery failed"]); }

async function sendPush(row: Delivery) {
  if (!pushConfigured()) throw new Error("VAPID not configured");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subscriptions = await query<Subscription>(`SELECT endpoint,p256dh,auth FROM web_push_subscriptions WHERE user_id=$1 AND (expiration_time IS NULL OR expiration_time > now())`, [row.user_id]);
  if (subscriptions.rows.length === 0) return;
  const payload = JSON.stringify({ eventId: row.event_id, href: row.href, title: socialAlertLabel({ contentType: row.content_type, provider: row.provider }), body: row.title, artworkUrl: row.artwork_url, tag: `core-${row.event_id}` });
  await Promise.all(subscriptions.rows.map(async (subscription) => {
    try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 300, urgency: row.content_type === "live" ? "high" : "normal" }); }
    catch (error) { const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0; if (status === 404 || status === 410) await query(`DELETE FROM web_push_subscriptions WHERE endpoint=$1`, [subscription.endpoint]); else throw error; }
  }));
}
async function sendEmail(row: Delivery) {
  if (!row.email) return;
  const label = socialAlertLabel({ contentType: row.content_type, provider: row.provider }); const url = new URL(row.href, process.env.NEXT_PUBLIC_SITE_URL ?? "https://thecoreboys.com").toString();
  await sendEmailWithResend({ to: row.email, subject: `${label}: ${row.title}`, text: `${row.title}\n\n${row.body ?? ""}\n\n${url}`, html: `<h1>${escapeHtml(row.title)}</h1><p>${escapeHtml(row.body ?? "")}</p><p><a href="${escapeHtml(url)}">Open on CORE</a></p>`, idempotencyKey: `social-event-${row.event_id}-${row.user_id}` });
}

export async function drainSocialNotificationDeliveries(limit = 50) {
  if (!deliveryEnabled()) return { enabled: false, sent: 0, failed: 0, skipped: 0 };
  const rows = await claim(limit); let sent = 0; let failures = 0; let skipped = 0;
  for (const row of rows.rows) { try { if (row.channel === "push") await sendPush(row); else if (getResendReadiness().readyToSend) await sendEmail(row); else { await query(`UPDATE social_notification_deliveries SET status='suppressed',last_error='Email delivery not configured',updated_at=now() WHERE id=$1`, [row.id]); skipped++; continue; } await completed(row.id); sent++; } catch (error) { await failed(row.id, error); failures++; } }
  return { enabled: true, sent, failed: failures, skipped };
}
