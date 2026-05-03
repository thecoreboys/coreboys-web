-- Single admin user table for the /admin gate. Replaces Clerk for this
-- one-person tool. Password is bcrypt-hashed; email is canonicalised
-- to lowercase on insert + lookup.

CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
