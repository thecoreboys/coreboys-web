-- One durable, last-known-good X feed. Website requests only read this row;
-- the authenticated scheduled refresh is the sole X API caller.
CREATE TABLE IF NOT EXISTS x_feed_snapshots (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  CONSTRAINT x_feed_snapshots_payload_array
    CHECK (jsonb_typeof(payload) = 'array')
);
