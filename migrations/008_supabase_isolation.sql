-- Additive: never edit 001-007. Run through the checksum-aware Node runner.
-- Object creation and ACL changes must commit together on fresh installations.
DO $hardening$
DECLARE
 role_name text;
 target text;
 obj record;
 owner_id oid := (SELECT oid FROM pg_roles WHERE rolname=current_user);
 tables text[] := ARRAY['accounts','sessions','invitations','auth_buckets','documents',
   'assets','asset_grants','document_assets','templates','audit_records','schema_migrations'];
 functions text[] := ARRAY['enforce_administrator()','actor_id()','actor_role()',
   'staff()','admin()','protect_account()','record_changes()','auth_lookup(text)',
   'session_lookup(text)','session_create(uuid,text,text)','session_remove(text)',
   'consume_limit(text,integer)','accept_invitation(text,text)','audit_output(uuid,text)',
   'can_apply_asset(uuid)','delete_document(uuid,integer)','revoke_deactivated_sessions()'];
BEGIN
 -- Fail closed rather than silently securing objects owned by another creator.
 FOREACH target IN ARRAY tables LOOP
  IF (SELECT relowner FROM pg_class WHERE oid=('public.'||target)::regclass) <> owner_id THEN
   RAISE EXCEPTION 'Migration login must own public.%', target;
  END IF;
 END LOOP;
 FOREACH target IN ARRAY functions LOOP
  IF (SELECT proowner FROM pg_proc WHERE oid=('public.'||target)::regprocedure) <> owner_id THEN
   RAISE EXCEPTION 'Migration login must own public.%', target;
  END IF;
  -- pg_catalog first, trusted public only, temporary relations last. Apply to
  -- invoker helpers too: SQL-language helpers must not inherit caller paths.
  EXECUTE format('ALTER FUNCTION public.%s SET search_path=pg_catalog,public,pg_temp',target);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rimdan_runtime'
   AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin OR rolreplication))
   OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='rimdan_runtime'::regrole) THEN
  RAISE EXCEPTION 'rimdan_runtime must be an unprivileged NOLOGIN group without parent roles';
 END IF;
 -- PUBLIC is mandatory; API roles are optional on ordinary PostgreSQL.
 FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role','rimdan_runtime'] LOOP
  IF role_name <> 'PUBLIC' AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN CONTINUE; END IF;
  IF role_name IN ('anon','authenticated','service_role') AND
    (pg_has_role(role_name,current_user,'MEMBER') OR pg_has_role(role_name,'rimdan_runtime','MEMBER')
     OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND rolsuper)) THEN
   RAISE EXCEPTION 'Unsafe API role membership: %',role_name;
  END IF;
  -- These grants also prevent untrusted code from replacing helpers in public.
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %s',CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
  FOREACH target IN ARRAY tables LOOP
   IF role_name <> 'rimdan_runtime' OR target='schema_migrations' THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s',target,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
    -- Table REVOKE does not remove pre-existing column-level grants.
    FOR obj IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||target)::regclass AND attnum>0 AND NOT attisdropped LOOP
     EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %s',obj.attname,target,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
    END LOOP;
   END IF;
  END LOOP;
  IF role_name <> 'rimdan_runtime' THEN
   FOREACH target IN ARRAY functions LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %s',target,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
   END LOOP;
  END IF;
  -- Only application-owned sequences; do not touch provider/extension objects.
  FOR obj IN SELECT s.oid::regclass AS name FROM pg_class s
    JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass
    JOIN pg_class t ON t.oid=d.refobjid
    WHERE s.relkind='S' AND t.relnamespace='public'::regnamespace AND t.relname=ANY(tables)
      AND d.deptype IN ('a','i') LOOP
   EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %s',obj.name,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
  END LOOP;
  -- Global defaults are additive to schema defaults. Both must be revoked,
  -- especially the global PUBLIC EXECUTE supplied by PostgreSQL itself.
  FOREACH target IN ARRAY ARRAY['TABLES','SEQUENCES','FUNCTIONS'] LOOP
   EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON %s FROM %s',target,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON %s FROM %s',target,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
  END LOOP;
 END LOOP;
END
$hardening$;
-- No runtime policy: only the operator owner may inspect/change the ledger.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
