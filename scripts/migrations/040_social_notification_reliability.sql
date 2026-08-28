-- Reliability hardening for social event fanout, webhook retries, and stale
-- reconciliation windows. Additive and safe to run repeatedly.

ALTER TABLE social_content_events
  ADD COLUMN IF NOT EXISTS notification_eligible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE social_content_events
  ADD COLUMN IF NOT EXISTS notification_suppressed_reason TEXT;

-- Reconciliation can discover years of history on first connection. Preserve
-- those rows for feeds, but never turn the backfill into an alert flood.
UPDATE social_content_events
   SET notification_eligible=FALSE,
       notification_suppressed_reason=COALESCE(notification_suppressed_reason,'stale_backfill')
 WHERE notification_eligible=TRUE
   AND published_at < received_at - interval '3 hours';

UPDATE social_notification_deliveries d
   SET status='suppressed',
       last_error='stale_backfill',
       available_at=now(),
       updated_at=now()
  FROM social_content_events e
 WHERE e.id=d.event_id
   AND e.notification_eligible=FALSE
   AND d.channel IN ('push','email')
   AND d.status IN ('pending','failed','processing');

ALTER TABLE social_webhook_receipts
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE social_webhook_receipts
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS social_webhook_receipts_retry_idx
  ON social_webhook_receipts (provider, processed_at, processing_started_at, received_at)
  WHERE processed_at IS NULL;

-- Older reconciliation code embedded UI feed prefixes in canonical ids while
-- direct webhooks did not. Collapse both forms without losing delivery/read
-- state. For X, all media cards from one status converge on the status id.
CREATE TEMP TABLE social_event_canonical_repairs ON COMMIT DROP AS
SELECT id AS legacy_event_id,
       received_at,
       CASE
         WHEN canonical_id LIKE 'youtube:yt-%'
           THEN 'youtube:' || substring(canonical_id FROM length('youtube:yt-') + 1)
         WHEN canonical_id LIKE 'tiktok:tt-%'
           THEN 'tiktok:' || substring(canonical_id FROM length('tiktok:tt-') + 1)
         WHEN canonical_id LIKE 'instagram:ig-%'
           THEN 'instagram:' || substring(canonical_id FROM length('instagram:ig-') + 1)
         WHEN canonical_id ~ '^x:x-[0-9]+'
           THEN 'x:' || substring(canonical_id FROM '^x:x-([0-9]+)')
       END AS target_canonical_id
  FROM social_content_events
 WHERE canonical_id LIKE 'youtube:yt-%'
    OR canonical_id LIKE 'tiktok:tt-%'
    OR canonical_id LIKE 'instagram:ig-%'
    OR canonical_id ~ '^x:x-[0-9]+';

ALTER TABLE social_event_canonical_repairs ADD COLUMN target_event_id UUID;

UPDATE social_event_canonical_repairs repair
   SET target_event_id=COALESCE(
     (SELECT event.id
        FROM social_content_events event
       WHERE event.canonical_id=repair.target_canonical_id
       LIMIT 1),
     (SELECT candidate.legacy_event_id
        FROM social_event_canonical_repairs candidate
       WHERE candidate.target_canonical_id=repair.target_canonical_id
       ORDER BY candidate.received_at,candidate.legacy_event_id
       LIMIT 1)
   );

INSERT INTO social_notification_deliveries
  (event_id,user_id,channel,status,attempts,available_at,last_error,
   delivered_at,read_at,created_at,updated_at)
SELECT repair.target_event_id,delivery.user_id,delivery.channel,delivery.status,
       delivery.attempts,delivery.available_at,delivery.last_error,
       delivery.delivered_at,delivery.read_at,delivery.created_at,delivery.updated_at
  FROM social_event_canonical_repairs repair
  JOIN social_notification_deliveries delivery
    ON delivery.event_id=repair.legacy_event_id
 WHERE repair.target_event_id<>repair.legacy_event_id
ON CONFLICT (event_id,user_id,channel) DO NOTHING;

UPDATE social_notification_deliveries target
   SET read_at=COALESCE(target.read_at,source.read_at),
       delivered_at=COALESCE(target.delivered_at,source.delivered_at),
       attempts=GREATEST(target.attempts,source.attempts),
       available_at=LEAST(target.available_at,source.available_at),
       status=CASE
         WHEN target.channel='in_app' AND COALESCE(target.read_at,source.read_at) IS NOT NULL THEN 'read'
         WHEN target.status IN ('sent','read') OR source.was_delivered THEN 'sent'
         ELSE target.status
       END,
       last_error=CASE
         WHEN target.status IN ('sent','read') OR source.was_delivered THEN NULL
         ELSE target.last_error
       END,
       updated_at=GREATEST(target.updated_at,source.updated_at)
  FROM (
    SELECT repair.target_event_id AS event_id,delivery.user_id,delivery.channel,
           MAX(delivery.read_at) AS read_at,
           MAX(delivery.delivered_at) AS delivered_at,
           MAX(delivery.attempts) AS attempts,
           MIN(delivery.available_at) AS available_at,
           MAX(delivery.updated_at) AS updated_at,
           BOOL_OR(delivery.status IN ('sent','read')) AS was_delivered
      FROM social_event_canonical_repairs repair
      JOIN social_notification_deliveries delivery
        ON delivery.event_id=repair.legacy_event_id
     GROUP BY repair.target_event_id,delivery.user_id,delivery.channel
  ) source
 WHERE target.event_id=source.event_id
   AND target.user_id=source.user_id
   AND target.channel=source.channel;

DELETE FROM social_content_events legacy
 USING social_event_canonical_repairs repair
 WHERE legacy.id=repair.legacy_event_id
   AND repair.legacy_event_id<>repair.target_event_id;

UPDATE social_content_events target
   SET canonical_id=repair.target_canonical_id
  FROM (
    SELECT DISTINCT target_event_id,target_canonical_id
      FROM social_event_canonical_repairs
  ) repair
 WHERE target.id=repair.target_event_id
   AND target.canonical_id<>repair.target_canonical_id;

DROP TABLE social_event_canonical_repairs;
