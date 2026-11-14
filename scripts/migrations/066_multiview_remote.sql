CREATE TABLE IF NOT EXISTS fan_multiview_sessions (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  host_secret_hash text NOT NULL,
  device text NOT NULL CHECK (device IN ('mac', 'windows', 'computer')),
  sources jsonb NOT NULL DEFAULT '[]',
  main text,
  command_revision integer NOT NULL DEFAULT 0,
  command_source text,
  command_status text NOT NULL DEFAULT 'applied' CHECK (command_status IN ('pending', 'applied', 'unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS fan_multiview_sessions_user_idx ON fan_multiview_sessions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS fan_multiview_sessions_expiry_idx ON fan_multiview_sessions (updated_at);

-- Only authenticated server routes may discover sessions or issue commands.
-- Keep browser API roles from bypassing account/host-secret validation.
ALTER TABLE public.fan_multiview_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fan_multiview_sessions FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.fan_multiview_sessions FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
