-- One paid request per canonical endpoint/window across schedulers and replicas.
-- Only hashed endpoint/credential keys are retained. Expired values are never read.
CREATE TABLE IF NOT EXISTS social_fetch_request_cache (
  request_key TEXT PRIMARY KEY CHECK (request_key ~ '^[a-f0-9]{64}$'),
  payload JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_fetch_request_cache_expiry_idx
  ON social_fetch_request_cache (expires_at);
