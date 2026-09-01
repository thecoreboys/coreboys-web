-- Unified, durable in-app inbox. External delivery remains owned by the
-- existing social and Fan Zone outboxes; this table is only the signed-in UI.

CREATE TABLE IF NOT EXISTS fan_inbox_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('creator','reminder','account','community')),
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT NOT NULL,
  image_url TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_key)
);

CREATE INDEX IF NOT EXISTS fan_inbox_notifications_list_idx
  ON fan_inbox_notifications (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS fan_inbox_notifications_unread_idx
  ON fan_inbox_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- This table was originally created lazily by the Fan Zone feature. Define it
-- here as well so a fresh production database can safely receive the inbox
-- backfill before any Fan Zone route has been visited.
CREATE TABLE IF NOT EXISTS fan_notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (event_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS fan_notification_outbox_pending_idx
  ON fan_notification_outbox (status, available_at, created_at)
  WHERE status IN ('pending','failed','processing');

-- Existing creator alerts gain a first-class inbox item without changing
-- which alerts were eligible or whether the user already read one.
INSERT INTO fan_inbox_notifications
  (user_id,category,source_key,title,body,href,image_url,avatar_url,created_at,read_at)
SELECT delivery.user_id,
       'creator',
       'social:' || event.id::text,
       event.title,
       event.body,
       event.href,
       event.artwork_url,
       NULLIF(event.platform_payload->>'authorAvatarUrl',''),
       delivery.created_at,
       delivery.read_at
  FROM social_notification_deliveries delivery
  JOIN social_content_events event ON event.id=delivery.event_id
 WHERE delivery.channel='in_app'
   AND delivery.status IN ('sent','read')
ON CONFLICT (user_id,source_key) DO NOTHING;

-- Preserve meaningful Fan Zone notices already queued before the inbox
-- existed. The normal TypeScript enqueue path supplies richer copy after this.
INSERT INTO fan_inbox_notifications
  (user_id,category,source_key,title,body,href,created_at)
SELECT outbox.user_id,
       CASE WHEN outbox.event_type LIKE 'fan_submission.%' THEN 'account' ELSE 'community' END,
       'fanzone:' || outbox.event_type || ':' || outbox.dedupe_key,
       CASE
         WHEN outbox.event_type='fan_submission.approved' THEN 'Your Fan Zone submission was approved'
         WHEN outbox.event_type='fan_submission.denied' THEN 'Your Fan Zone submission was reviewed'
         WHEN outbox.event_type='fanzone.community_live' THEN COALESCE(NULLIF(outbox.payload->>'communityName',''),'Your CORE community') || ' is live'
         WHEN outbox.event_type='fanzone.weekly_digest' THEN 'Your weekly CORE community recap is ready'
         ELSE COALESCE(NULLIF(outbox.payload->>'title',''),'New update from your CORE community')
       END,
       CASE
         WHEN outbox.event_type='fan_submission.denied' AND NULLIF(outbox.payload->>'denialReason','') IS NOT NULL
           THEN 'Review note: ' || LEFT(outbox.payload->>'denialReason',300)
         ELSE NULL
       END,
       CASE
         WHEN COALESCE(outbox.payload->>'href','') LIKE '/%' AND outbox.payload->>'href' NOT LIKE '//%'
           THEN outbox.payload->>'href'
         ELSE CASE WHEN outbox.event_type LIKE 'fanzone.%' THEN '/fanzone#communities' ELSE '/account' END
       END,
       outbox.created_at
  FROM fan_notification_outbox outbox
ON CONFLICT (user_id,source_key) DO NOTHING;
