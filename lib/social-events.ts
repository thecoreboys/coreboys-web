import "server-only";

import { query } from "@/lib/db";
import type { FeedItem, SocialPlatform } from "@/components/feed/types";
import type { AlertOrientation, SocialAlert, SocialContentType } from "@/lib/social-alert";

export type SocialEventInput = {
  provider: SocialPlatform | "twitch";
  memberSlug: string | null;
  contentType: SocialContentType;
  canonicalId: string;
  title: string;
  body?: string | null;
  href: string;
  artworkUrl?: string | null;
  orientation?: AlertOrientation | null;
  publishedAt: string;
  platformPayload?: Record<string, unknown>;
};

type EventRow = {
  id: string;
  provider: SocialEventInput["provider"];
  member_slug: string | null;
  content_type: SocialContentType;
  title: string;
  body: string | null;
  href: string;
  artwork_url: string | null;
  orientation: AlertOrientation | null;
  published_at: string;
};

function bounded(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function validUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function rowToAlert(row: EventRow, deliveryId: string, readAt: string | null): SocialAlert {
  return {
    id: deliveryId,
    eventId: row.id,
    provider: row.provider,
    memberSlug: row.member_slug,
    contentType: row.content_type,
    title: row.title,
    body: row.body,
    href: row.href,
    artworkUrl: row.artwork_url,
    orientation: row.orientation,
    publishedAt: new Date(row.published_at).toISOString(),
    read: Boolean(readAt),
  };
}

function asContentType(item: FeedItem): SocialContentType {
  if (item.isLive || item.format === "live") return "live";
  if (item.format === "photo" || item.mediaType === "image") return "photo";
  if (item.platform === "x") return "post";
  if (item.format === "short") return "short";
  return "video";
}

function asOrientation(item: FeedItem): AlertOrientation | null {
  if (item.orientation === "landscape" || item.orientation === "portrait" || item.orientation === "square") return item.orientation;
  if (item.format === "short") return "portrait";
  if (item.format === "photo") return "square";
  return "landscape";
}

export function socialEventFromFeedItem(item: FeedItem): SocialEventInput | null {
  const href = validUrl(item.sourceUrl ?? item.url);
  const publishedAt = Date.parse(item.publishedAt);
  if (!href || !Number.isFinite(publishedAt) || !item.id.trim()) return null;
  return {
    provider: item.platform,
    memberSlug: item.authorSlug,
    contentType: asContentType(item),
    canonicalId: `${item.platform}:${item.id}`.slice(0, 300),
    title: bounded(item.title || `${item.authorLabel} posted`, 240),
    body: bounded(item.authorLabel, 160) || null,
    href,
    artworkUrl: validUrl(item.thumbnailUrl ?? ""),
    orientation: asOrientation(item),
    publishedAt: new Date(publishedAt).toISOString(),
    platformPayload: { authorLabel: item.authorLabel, sourceUrl: item.sourceUrl ?? item.url },
  };
}

/** Insert one normalized content event. `created` is false for provider retries. */
export async function recordSocialEvent(input: SocialEventInput): Promise<{ id: string; created: boolean }> {
  const href = validUrl(input.href);
  const published = Date.parse(input.publishedAt);
  if (!href || !Number.isFinite(published) || !input.canonicalId.trim()) throw new Error("invalid_social_event");
  const inserted = await query<{ id: string }>(
    `INSERT INTO social_content_events
       (provider,member_slug,content_type,canonical_id,title,body,href,artwork_url,orientation,platform_payload,published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     ON CONFLICT (canonical_id) DO NOTHING
     RETURNING id::text`,
    [
      input.provider,
      input.memberSlug,
      input.contentType,
      bounded(input.canonicalId, 300),
      bounded(input.title, 240),
      input.body ? bounded(input.body, 500) : null,
      href,
      input.artworkUrl ? validUrl(input.artworkUrl) : null,
      input.orientation ?? null,
      JSON.stringify(input.platformPayload ?? {}),
      new Date(published).toISOString(),
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) {
    const existing = await query<{ id: string }>(
      `SELECT id::text FROM social_content_events WHERE canonical_id=$1 LIMIT 1`,
      [bounded(input.canonicalId, 300)],
    );
    return { id: existing.rows[0]!.id, created: false };
  }
  await createEventDeliveries(id, input.memberSlug, input.contentType);
  return { id, created: true };
}

/**
 * In-app alerts default on for every signed-in fan. Push/email entries are
 * created only for users that explicitly enable that channel.
 */
async function createEventDeliveries(eventId: string, memberSlug: string | null, contentType: SocialContentType) {
  const member = memberSlug ?? "core";
  await query(
    `INSERT INTO social_notification_deliveries (event_id,user_id,channel,status,delivered_at)
     SELECT $1, u.id, 'in_app', 'sent', now()
       FROM fan_users u
       LEFT JOIN fan_social_notification_settings s ON s.user_id=u.id
       LEFT JOIN fan_social_notification_rules r
         ON r.user_id=u.id AND r.member_slug=$2 AND r.content_type=$3
      WHERE COALESCE(s.enabled,true)=true
        AND COALESCE(s.in_app_enabled,true)=true
        AND COALESCE(r.enabled,true)=true
     ON CONFLICT (event_id,user_id,channel) DO NOTHING`,
    [eventId, member, contentType],
  );
  await query(
    `INSERT INTO social_notification_deliveries (event_id,user_id,channel,status)
     SELECT $1, u.id, 'push', 'pending'
       FROM fan_users u
       JOIN web_push_subscriptions p ON p.user_id=u.id
       LEFT JOIN fan_social_notification_settings s ON s.user_id=u.id
       LEFT JOIN fan_social_notification_rules r
         ON r.user_id=u.id AND r.member_slug=$2 AND r.content_type=$3
      WHERE COALESCE(s.enabled,true)=true AND COALESCE(s.push_enabled,false)=true
        AND COALESCE(r.enabled,true)=true
     ON CONFLICT (event_id,user_id,channel) DO NOTHING`,
    [eventId, member, contentType],
  );
  await query(
    `INSERT INTO social_notification_deliveries (event_id,user_id,channel,status)
     SELECT $1, u.id, 'email', 'pending'
       FROM fan_users u
       LEFT JOIN fan_social_notification_settings s ON s.user_id=u.id
       LEFT JOIN fan_social_notification_rules r
         ON r.user_id=u.id AND r.member_slug=$2 AND r.content_type=$3
      WHERE u.email_verified=true AND COALESCE(s.enabled,true)=true
        AND COALESCE(s.email_enabled,false)=true AND COALESCE(r.enabled,true)=true
     ON CONFLICT (event_id,user_id,channel) DO NOTHING`,
    [eventId, member, contentType],
  );
}

export async function listSocialAlerts(userId: string, limit = 40, before?: string | null): Promise<SocialAlert[]> {
  const cursor = before ? Date.parse(before) : NaN;
  const rows = await query<EventRow & { delivery_id: string; read_at: string | null }>(
    `SELECT e.id::text,e.provider,e.member_slug,e.content_type,e.title,e.body,e.href,e.artwork_url,e.orientation,
            e.published_at::text,d.id::text AS delivery_id,d.read_at::text
       FROM social_notification_deliveries d
       JOIN social_content_events e ON e.id=d.event_id
      WHERE d.user_id=$1 AND d.channel='in_app' AND d.status IN ('sent','read')
        AND ($2::timestamptz IS NULL OR d.created_at < $2::timestamptz)
      ORDER BY d.created_at DESC
      LIMIT $3`,
    [userId, Number.isFinite(cursor) ? new Date(cursor).toISOString() : null, Math.min(100, Math.max(1, limit))],
  );
  return rows.rows.map((row) => rowToAlert(row, row.delivery_id, row.read_at));
}

export async function markSocialAlertRead(userId: string, deliveryId: string): Promise<boolean> {
  const result = await query(
    `UPDATE social_notification_deliveries
        SET status='read', read_at=COALESCE(read_at,now()), updated_at=now()
      WHERE id=$1 AND user_id=$2 AND channel='in_app' AND status IN ('sent','read')`,
    [deliveryId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type SocialNotificationSettings = {
  enabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  rules: Array<{ memberSlug: string; contentType: SocialContentType; enabled: boolean }>;
};

export async function getSocialNotificationSettings(userId: string): Promise<SocialNotificationSettings> {
  const [settings, rules] = await Promise.all([
    query<{ enabled: boolean; in_app_enabled: boolean; push_enabled: boolean; email_enabled: boolean }>(
      `SELECT enabled,in_app_enabled,push_enabled,email_enabled FROM fan_social_notification_settings WHERE user_id=$1`, [userId]),
    query<{ member_slug: string; content_type: SocialContentType; enabled: boolean }>(
      `SELECT member_slug,content_type,enabled FROM fan_social_notification_rules WHERE user_id=$1 ORDER BY member_slug,content_type`, [userId]),
  ]);
  const row = settings.rows[0];
  return {
    enabled: row?.enabled ?? true,
    inAppEnabled: row?.in_app_enabled ?? true,
    pushEnabled: row?.push_enabled ?? false,
    emailEnabled: row?.email_enabled ?? false,
    rules: rules.rows.map((rule) => ({ memberSlug: rule.member_slug, contentType: rule.content_type, enabled: rule.enabled })),
  };
}

export async function saveSocialNotificationSettings(userId: string, settings: SocialNotificationSettings) {
  await query(
    `INSERT INTO fan_social_notification_settings (user_id,enabled,in_app_enabled,push_enabled,email_enabled)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET enabled=$2,in_app_enabled=$3,push_enabled=$4,email_enabled=$5,updated_at=now()`,
    [userId, settings.enabled, settings.inAppEnabled, settings.pushEnabled, settings.emailEnabled],
  );
  // The UI submits the complete override set; removing old overrides restores
  // the default-on rule instead of leaving an invisible stale preference.
  await query(`DELETE FROM fan_social_notification_rules WHERE user_id=$1`, [userId]);
  for (const rule of settings.rules.slice(0, 200)) {
    await query(
      `INSERT INTO fan_social_notification_rules (user_id,member_slug,content_type,enabled)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id,member_slug,content_type) DO UPDATE SET enabled=$4,updated_at=now()`,
      [userId, bounded(rule.memberSlug, 80), rule.contentType, rule.enabled],
    );
  }
}

export async function upsertPushSubscription(userId: string, input: { endpoint: string; p256dh: string; auth: string; expirationTime?: number | null; userAgent?: string | null }) {
  const endpoint = validUrl(input.endpoint);
  if (!endpoint || input.p256dh.length > 300 || input.auth.length > 300) throw new Error("invalid_push_subscription");
  await query(
    `INSERT INTO web_push_subscriptions (user_id,endpoint,p256dh,auth,expiration_time,user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=$1,p256dh=$3,auth=$4,expiration_time=$5,user_agent=$6,updated_at=now()`,
    [userId, endpoint, input.p256dh, input.auth, input.expirationTime ? new Date(input.expirationTime).toISOString() : null, input.userAgent?.slice(0, 500) ?? null],
  );
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await query(`DELETE FROM web_push_subscriptions WHERE user_id=$1 AND endpoint=$2`, [userId, endpoint]);
}

export async function recordWebhookReceipt(input: {
  provider: "twitch" | "youtube" | "instagram" | "tiktok";
  externalEventId?: string | null;
  eventType: string;
  signatureValid: boolean;
  payload: unknown;
}) {
  const result = await query<{ id: string }>(
    `INSERT INTO social_webhook_receipts (provider,external_event_id,event_type,signature_valid,payload,processed_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,now())
     ON CONFLICT (provider,external_event_id) DO NOTHING
     RETURNING id::text`,
    [input.provider, input.externalEventId?.slice(0, 300) ?? null, bounded(input.eventType, 160), input.signatureValid, JSON.stringify(input.payload ?? {})],
  );
  return { created: Boolean(result.rows[0]), id: result.rows[0]?.id ?? null };
}

export async function upsertSocialSource(input: {
  provider: SocialEventInput["provider"];
  accountRef: string;
  memberSlug?: string | null;
  accountLabel?: string | null;
  credentialState?: "healthy" | "missing" | "unknown" | "expired";
  webhookState?: "verified" | "not_configured" | "error" | "pending";
  cursor?: string | null;
  error?: string | null;
  received?: boolean;
}) {
  await query(
    `INSERT INTO social_source_registry (provider,account_ref,member_slug,account_label,credential_state,webhook_state,last_cursor,last_received_at,last_reconciled_at,last_error,next_reconcile_at)
     VALUES ($1,$2,$3,$4,COALESCE($5,'unknown'),COALESCE($6,'not_configured'),$7,CASE WHEN $9 THEN now() ELSE NULL END,now(),$8,now() + interval '10 minutes')
     ON CONFLICT (provider,account_ref) DO UPDATE SET
       member_slug=EXCLUDED.member_slug, account_label=EXCLUDED.account_label,
       credential_state=COALESCE($5,social_source_registry.credential_state),
       webhook_state=COALESCE($6,social_source_registry.webhook_state),
       last_cursor=COALESCE($7,social_source_registry.last_cursor),
       last_received_at=CASE WHEN $9 THEN now() ELSE social_source_registry.last_received_at END,
       last_reconciled_at=now(), last_error=$8, next_reconcile_at=now() + interval '10 minutes', updated_at=now()`,
    [input.provider, bounded(input.accountRef, 300), input.memberSlug ?? null, input.accountLabel ?? null, input.credentialState ?? null, input.webhookState ?? null, input.cursor ?? null, input.error?.slice(0, 500) ?? null, input.received === true],
  );
}

export async function getSocialSourceHealth() {
  const result = await query<{
    provider: string; account_ref: string; member_slug: string | null; account_label: string | null;
    credential_state: string; webhook_state: string; last_cursor: string | null; last_received_at: string | null;
    last_reconciled_at: string | null; last_error: string | null; next_reconcile_at: string | null;
  }>(`SELECT provider,account_ref,member_slug,account_label,credential_state,webhook_state,last_cursor,
              last_received_at::text,last_reconciled_at::text,last_error,next_reconcile_at::text
       FROM social_source_registry ORDER BY provider, member_slug NULLS FIRST, account_ref`);
  return result.rows;
}
