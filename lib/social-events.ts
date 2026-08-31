import "server-only";

import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import type { FeedItem, SocialPlatform } from "@/components/feed/types";
import type { AlertOrientation, SocialAlert, SocialContentType } from "@/lib/social-alert";
import {
  canonicalSocialEventId,
  isFreshSocialEvent,
  socialContentTypeForFeedItem,
  socialNotificationMaxAgeMs,
} from "@/lib/social-event-normalization";

export type SocialEventInput = {
  provider: SocialPlatform | "twitch";
  memberSlug: string | null;
  contentType: SocialContentType;
  canonicalId: string;
  title: string;
  body?: string | null;
  href: string;
  artworkUrl?: string | null;
  avatarUrl?: string | null;
  orientation?: AlertOrientation | null;
  publishedAt: string;
  platformPayload?: Record<string, unknown>;
  /** Explicitly allow/suppress fanout. Omitted events use the freshness gate. */
  notify?: boolean;
};

type EventRow = {
  id: string;
  provider: SocialEventInput["provider"];
  member_slug: string | null;
  content_type: SocialContentType;
  title: string;
  body: string | null;
  avatar_url: string | null;
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
    avatarUrl: row.avatar_url,
    href: row.href,
    artworkUrl: row.artwork_url,
    orientation: row.orientation,
    publishedAt: new Date(row.published_at).toISOString(),
    read: Boolean(readAt),
  };
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
    contentType: socialContentTypeForFeedItem(item),
    canonicalId: canonicalSocialEventId(item).slice(0, 300),
    title: bounded(item.title || `${item.authorLabel} posted`, 240),
    body: bounded(item.authorLabel, 160) || null,
    avatarUrl: validUrl(item.x?.authorAvatarUrl ?? ""),
    href,
    artworkUrl: validUrl(item.thumbnailUrl ?? ""),
    orientation: asOrientation(item),
    publishedAt: new Date(publishedAt).toISOString(),
    // Keep only durable rendering metadata in the event snapshot. In
    // particular, provider CDN video URLs are intentionally excluded because
    // they expire; public catalog reads reconstruct TikTok/Instagram embeds
    // from the canonical provider id/permalink instead.
    platformPayload: {
      authorLabel: item.authorLabel,
      authorAvatarUrl: validUrl(item.x?.authorAvatarUrl ?? ""),
      sourceUrl: item.sourceUrl ?? item.url,
      canonicalProviderId: item.canonicalProviderId,
      embedUrl: item.embedUrl,
      mediaType: item.mediaType,
      format: item.format,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
    },
  };
}

/** Insert one normalized content event. `created` is false for provider retries. */
export async function recordSocialEvent(input: SocialEventInput): Promise<{ id: string; created: boolean }> {
  const href = validUrl(input.href);
  const published = Date.parse(input.publishedAt);
  if (!href || !Number.isFinite(published) || !input.canonicalId.trim()) throw new Error("invalid_social_event");
  const canonicalId = bounded(input.canonicalId, 300);
  const notificationEligible = input.notify ?? isFreshSocialEvent(
    published,
    Date.now(),
    socialNotificationMaxAgeMs(),
  );
  const suppressionReason = notificationEligible
    ? null
    : input.notify === false
      ? "source_suppressed"
      : "stale_backfill";

  return withTransaction(async (client) => {
    type StoredEvent = {
      id: string;
      member_slug: string | null;
      content_type: SocialContentType;
      published_at: string;
      notification_eligible: boolean;
    };
    const inserted = await client.query<StoredEvent>(
      `INSERT INTO social_content_events
         (provider,member_slug,content_type,canonical_id,title,body,href,artwork_url,orientation,
          platform_payload,published_at,notification_eligible,notification_suppressed_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
       ON CONFLICT (canonical_id) DO NOTHING
       RETURNING id::text,member_slug,content_type,published_at::text,notification_eligible`,
      [
        input.provider,
        input.memberSlug,
        input.contentType,
        canonicalId,
        bounded(input.title, 240),
        input.body ? bounded(input.body, 500) : null,
        href,
        input.artworkUrl ? validUrl(input.artworkUrl) : null,
        input.orientation ?? null,
        JSON.stringify(input.platformPayload ?? {}),
        new Date(published).toISOString(),
        notificationEligible,
        suppressionReason,
      ],
    );
    const created = Boolean(inserted.rows[0]);
    const event = inserted.rows[0] ?? (await client.query<StoredEvent>(
      `SELECT id::text,member_slug,content_type,published_at::text,notification_eligible
         FROM social_content_events WHERE canonical_id=$1 LIMIT 1`,
      [canonicalId],
    )).rows[0];
    if (!event) throw new Error("social_event_conflict_missing");

    const eligibleNow = input.notify !== false
      && event.notification_eligible
      && (input.notify === true || isFreshSocialEvent(
        event.published_at,
        Date.now(),
        socialNotificationMaxAgeMs(),
      ));
    // Always retry the idempotent fanout for an eligible existing event. This
    // repairs rows created by the pre-transaction implementation without ever
    // duplicating a channel delivery.
    if (eligibleNow) {
      await createEventDeliveries(client, event.id, event.member_slug, event.content_type);
    }
    return { id: event.id, created };
  });
}

/**
 * In-app alerts default on for every signed-in fan. Push/email entries are
 * created only for users that explicitly enable that channel.
 */
async function createEventDeliveries(
  client: PoolClient,
  eventId: string,
  memberSlug: string | null,
  contentType: SocialContentType,
) {
  const member = memberSlug ?? "core";
  await client.query(
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
  await client.query(
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
  await client.query(
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
            NULLIF(e.platform_payload->>'authorAvatarUrl','') AS avatar_url,
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
  const uniqueRules = new Map<string, SocialNotificationSettings["rules"][number]>();
  for (const rule of settings.rules.slice(0, 200)) {
    const memberSlug = bounded(rule.memberSlug, 80);
    if (!memberSlug) continue;
    uniqueRules.set(`${memberSlug}\u0000${rule.contentType}`, { ...rule, memberSlug });
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO fan_social_notification_settings (user_id,enabled,in_app_enabled,push_enabled,email_enabled)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET enabled=$2,in_app_enabled=$3,push_enabled=$4,email_enabled=$5,updated_at=now()`,
      [userId, settings.enabled, settings.inAppEnabled, settings.pushEnabled, settings.emailEnabled],
    );
    // The UI submits the complete override set; removing old overrides restores
    // the default-on rule instead of leaving an invisible stale preference.
    await client.query(`DELETE FROM fan_social_notification_rules WHERE user_id=$1`, [userId]);
    for (const rule of uniqueRules.values()) {
      await client.query(
        `INSERT INTO fan_social_notification_rules (user_id,member_slug,content_type,enabled)
         VALUES ($1,$2,$3,$4)`,
        [userId, rule.memberSlug, rule.contentType, rule.enabled],
      );
    }
  });
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
  const externalEventId = input.externalEventId?.slice(0, 300) ?? null;
  const values: unknown[] = [
    input.provider,
    externalEventId,
    bounded(input.eventType, 160),
    input.signatureValid,
    JSON.stringify(input.payload ?? {}),
  ];

  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string; attempts: number }>(
      `INSERT INTO social_webhook_receipts
         (provider,external_event_id,event_type,signature_valid,payload,processed_at,processing_started_at,attempts)
       VALUES ($1,$2,$3,$4,$5::jsonb,NULL,now(),1)
       ON CONFLICT (provider,external_event_id) DO NOTHING
       RETURNING id::text,attempts`,
      values,
    );
    if (inserted.rows[0]) {
      return {
        created: true,
        id: inserted.rows[0].id,
        shouldProcess: true,
        attempt: inserted.rows[0].attempts,
      };
    }

    // A duplicate is normally acknowledged without doing work. Failed or
    // abandoned receipts remain unprocessed and can be reclaimed after their
    // lease expires, which makes provider retries useful instead of permanent
    // no-ops.
    const reclaimed = await client.query<{ id: string; attempts: number }>(
      `UPDATE social_webhook_receipts
          SET processing_started_at=now(),attempts=attempts+1,processing_error=NULL
        WHERE provider=$1 AND external_event_id IS NOT DISTINCT FROM $2
          AND processed_at IS NULL
          AND (processing_started_at IS NULL OR processing_started_at <= now()-interval '15 minutes')
       RETURNING id::text,attempts`,
      [input.provider, externalEventId],
    );
    if (reclaimed.rows[0]) {
      return {
        created: false,
        id: reclaimed.rows[0].id,
        shouldProcess: true,
        attempt: reclaimed.rows[0].attempts,
      };
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id::text FROM social_webhook_receipts
        WHERE provider=$1 AND external_event_id IS NOT DISTINCT FROM $2
        ORDER BY received_at DESC LIMIT 1`,
      [input.provider, externalEventId],
    );
    return {
      created: false,
      id: existing.rows[0]?.id ?? null,
      shouldProcess: false,
      attempt: null,
    };
  });
}

export async function completeWebhookReceipt(id: string, attempt: number): Promise<void> {
  await query(
    `UPDATE social_webhook_receipts
        SET processed_at=now(),processing_started_at=NULL,processing_error=NULL
      WHERE id=$1 AND attempts=$2 AND processed_at IS NULL`,
    [id, attempt],
  );
}

export async function failWebhookReceipt(id: string, attempt: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "webhook processing failed";
  await query(
    `UPDATE social_webhook_receipts
        SET processing_started_at=NULL,processing_error=LEFT($3,500)
      WHERE id=$1 AND attempts=$2 AND processed_at IS NULL`,
    [id, attempt, message],
  );
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
  /** Reconciliation can confirm configuration, but cannot undo revocation. */
  preserveExpired?: boolean;
}) {
  await query(
    `INSERT INTO social_source_registry (provider,account_ref,member_slug,account_label,credential_state,webhook_state,last_cursor,last_received_at,last_reconciled_at,last_error,next_reconcile_at)
     VALUES ($1,$2,$3,$4,COALESCE($5,'unknown'),COALESCE($6,'not_configured'),$7,CASE WHEN $9 THEN now() ELSE NULL END,now(),$8,now() + interval '10 minutes')
     ON CONFLICT (provider,account_ref) DO UPDATE SET
       member_slug=EXCLUDED.member_slug, account_label=EXCLUDED.account_label,
       credential_state=CASE
         WHEN $10 AND social_source_registry.credential_state='expired' AND $5='healthy'
           THEN social_source_registry.credential_state
         ELSE COALESCE($5,social_source_registry.credential_state)
       END,
       webhook_state=COALESCE($6,social_source_registry.webhook_state),
       last_cursor=COALESCE($7,social_source_registry.last_cursor),
       last_received_at=CASE WHEN $9 THEN now() ELSE social_source_registry.last_received_at END,
       last_reconciled_at=now(),
       last_error=CASE
         WHEN $10 AND social_source_registry.credential_state='expired' AND $5='healthy'
           THEN social_source_registry.last_error
         ELSE $8
       END,
       next_reconcile_at=now() + interval '10 minutes', updated_at=now()`,
    [input.provider, bounded(input.accountRef, 300), input.memberSlug ?? null, input.accountLabel ?? null, input.credentialState ?? null, input.webhookState ?? null, input.cursor ?? null, input.error?.slice(0, 500) ?? null, input.received === true, input.preserveExpired === true],
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
