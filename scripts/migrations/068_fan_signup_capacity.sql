-- Keep the shared, rolling one-hour registration count inexpensive.
CREATE INDEX IF NOT EXISTS fan_users_created_at_idx ON fan_users (created_at DESC);
