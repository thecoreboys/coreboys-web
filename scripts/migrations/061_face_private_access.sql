-- Face data is served only by the web app's authenticated, permission-checked API.
-- Supabase's explicit default grants include views/functions, and revoking an
-- individual role does not remove access inherited through PUBLIC.
DO $$
DECLARE api_role text; recipient text; object record;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['PUBLIC','anon','authenticated'] LOOP
    IF api_role='PUBLIC' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      recipient=CASE WHEN api_role='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(api_role) END;
      FOR object IN
        SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname LIKE 'face\_%' ESCAPE '\'
           AND c.relkind IN ('r','p','v','m','f','S')
      LOOP
        EXECUTE format('REVOKE ALL ON %s public.%I FROM %s',
          CASE WHEN object.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,object.relname,recipient);
      END LOOP;
      FOR object IN
        SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname ~ '(^face_|_face_)'
      LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',object.signature,recipient);
      END LOOP;
    END IF;
  END LOOP;
END $$;
