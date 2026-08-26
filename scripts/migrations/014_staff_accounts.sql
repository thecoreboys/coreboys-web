-- Multi-account staff access for the web admin and member Studio.
-- Additive/idempotent: production already has the richer coreboys-db
-- admin_users shape, while older web-only databases may only have email,
-- password_hash, and created_at.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS roles text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS member_slug text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE admin_users
   SET id = COALESCE(id, gen_random_uuid()),
       role = CASE
         WHEN role = 'member_manager' THEN 'member_manager'
         WHEN member_slug IS NOT NULL
          AND roles ~* '(^|,)\s*member_manager\s*(,|$)' THEN 'member_manager'
         ELSE 'admin'
       END,
       display_name = COALESCE(NULLIF(BTRIM(display_name), ''), email),
       updated_at = COALESCE(updated_at, now());

ALTER TABLE admin_users
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN role SET DEFAULT 'admin',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_staff_id_uniq
  ON admin_users (id);

CREATE INDEX IF NOT EXISTS admin_users_staff_scope_idx
  ON admin_users (role, member_slug)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'admin_users'::regclass
       AND conname = 'admin_users_staff_role_check'
  ) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_staff_role_check
      CHECK (role IN ('admin', 'member_manager'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'admin_users'::regclass
       AND conname = 'admin_users_staff_scope_check'
  ) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_staff_scope_check
      CHECK (
        (role = 'admin' AND member_slug IS NULL)
        OR (role = 'member_manager' AND member_slug IS NOT NULL AND BTRIM(member_slug) <> '')
      );
  END IF;
END $$;
