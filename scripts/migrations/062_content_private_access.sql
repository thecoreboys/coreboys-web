-- Provider payloads, removal evidence, and verification leases are server-only.
-- Revoke PUBLIC as well as Supabase's explicit default API grants. Owners and
-- trusted service roles retain their existing grants and RLS bypass; do not FORCE RLS.
DO $$
DECLARE
  content_table text;
  api_role text;
BEGIN
  FOREACH content_table IN ARRAY ARRAY[
    'content_tombstones',
    'content_removal_cleanup',
    'social_fetch_request_cache',
    'content_verification_schedule',
    'content_verification_checks',
    'twitch_content_verification_schedule',
    'twitch_content_verification_checks',
    'x_content_verification_schedule',
    'x_content_verification_checks'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', content_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', content_table);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', content_table, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
