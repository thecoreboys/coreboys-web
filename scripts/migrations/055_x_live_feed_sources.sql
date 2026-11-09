-- A successful roster refresh records its source set so adding crew accounts
-- starts a complete recent window. Stream updates never renew roster health.
ALTER TABLE x_feed_snapshots ADD COLUMN IF NOT EXISTS source_accounts JSONB;
ALTER TABLE x_feed_snapshots ADD COLUMN IF NOT EXISTS stream_received_at TIMESTAMPTZ;
-- A streamed post cannot skip other accounts' unseen posts on the next poll.
ALTER TABLE x_feed_snapshots ADD COLUMN IF NOT EXISTS search_cursor TEXT;
-- Continue a busy source window over budgeted pages before advancing its cursor.
ALTER TABLE x_feed_snapshots ADD COLUMN IF NOT EXISTS search_continuation JSONB;
