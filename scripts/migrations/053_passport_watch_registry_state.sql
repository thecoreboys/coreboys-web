-- One complete catalog acknowledgment, committed with its asset batches.
-- This public metadata contains no account information and is independent of Redis.
CREATE TABLE IF NOT EXISTS passport_watch_registry_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fingerprint text NOT NULL,
  archive_confirmed_at bigint NOT NULL,
  live_confirmed_at bigint NOT NULL
);
