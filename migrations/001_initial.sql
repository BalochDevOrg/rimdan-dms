-- Run once with a dedicated migration owner, never the web runtime credential.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rimdan_runtime') THEN CREATE ROLE rimdan_runtime NOLOGIN; END IF; END $$;
CREATE TABLE accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL CHECK(email=lower(email)),
 password_hash text, role text NOT NULL CHECK(role IN ('administrator','manager','employee')),
 active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_administrator ON accounts ((role)) WHERE active AND role='administrator';
CREATE FUNCTION enforce_administrator() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (SELECT count(*) FROM accounts WHERE active AND role='administrator')<>1 THEN
  RAISE EXCEPTION 'Exactly one active administrator is required' USING ERRCODE='23514';
 END IF; RETURN NULL;
END $$;
-- Empty, unbootstrapped database is allowed. Every account write after initial
-- bootstrap must commit with exactly one active administrator; zero is forbidden.
CREATE CONSTRAINT TRIGGER administrator_required AFTER INSERT OR UPDATE OR DELETE ON accounts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_administrator();
CREATE FUNCTION actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;
CREATE FUNCTION actor_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT role FROM accounts WHERE id=actor_id() AND active
$$;
CREATE FUNCTION staff() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(actor_role() IN ('administrator','manager'),false) $$;
CREATE FUNCTION admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(actor_role()='administrator',false) $$;
CREATE FUNCTION protect_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='accounts'::regclass)) THEN RETURN NEW; END IF;
 IF NOT admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active) THEN
  IF OLD.id=actor_id() THEN RAISE EXCEPTION 'Cannot modify own role or activity' USING ERRCODE='42501'; END IF;
  IF OLD.role='administrator' OR NEW.role='administrator' THEN RAISE EXCEPTION 'Administrator transfer requires maintenance' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.role='administrator' THEN RAISE EXCEPTION 'Administrator bootstrap requires owner' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_guard BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION protect_account();
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts, csrf text NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts,
 token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_by uuid NOT NULL REFERENCES accounts
);
CREATE TABLE auth_buckets (key text PRIMARY KEY, started_at timestamptz NOT NULL, attempts int NOT NULL);
CREATE TABLE documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, number text NOT NULL DEFAULT '',
 recipient text NOT NULL DEFAULT '', type text NOT NULL, language text NOT NULL CHECK(language IN ('fa','en')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized','archived')),
 content jsonb NOT NULL, version int NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES accounts,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 import_owner uuid REFERENCES accounts, import_key text, UNIQUE(import_owner,import_key)
);
CREATE INDEX documents_search ON documents USING gin(to_tsvector('simple',title||' '||number||' '||recipient));
CREATE TABLE assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES accounts,
 kind text NOT NULL CHECK(kind IN ('signature','stamp','letterhead')), mime text NOT NULL CHECK(mime='image/png'),
 bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152), width int NOT NULL, height int NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE asset_grants (asset_id uuid REFERENCES assets ON DELETE CASCADE, account_id uuid REFERENCES accounts, PRIMARY KEY(asset_id,account_id));
CREATE TABLE document_assets (document_id uuid REFERENCES documents ON DELETE CASCADE,asset_id uuid REFERENCES assets,PRIMARY KEY(document_id,asset_id));
CREATE TABLE templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL, name_fa text NOT NULL, name_en text NOT NULL,
 body_fa text NOT NULL, body_en text NOT NULL, version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_records (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, entity text NOT NULL, entity_id uuid,
 action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION record_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE action_name text; record_id uuid;
BEGIN
 record_id=coalesce(NEW.id,OLD.id);
 IF TG_TABLE_NAME='documents' THEN
  action_name=CASE WHEN TG_OP='INSERT' THEN 'document_created' WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'document_deleted' WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'document_'||NEW.status ELSE 'document_modified' END;
  INSERT INTO audit_records(actor_id,entity,entity_id,action,detail) VALUES(actor_id(),'document',record_id,action_name,jsonb_build_object('version',NEW.version,'status',NEW.status));
  IF (TG_OP='INSERT' OR NEW.content->'marks' IS DISTINCT FROM OLD.content->'marks') THEN
   IF NEW.content->'marks'->'signature' IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.content->'marks'->'signature' END) THEN
    INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),'document',record_id,'document_signing_changed');
   END IF;
   IF NEW.content->'marks'->'stamp' IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.content->'marks'->'stamp' END) THEN
    INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),'document',record_id,'document_stamping_changed');
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='accounts' THEN
  INSERT INTO audit_records(actor_id,entity,entity_id,action,detail) VALUES(actor_id(),'account',record_id,CASE WHEN TG_OP='INSERT' THEN 'account_created' ELSE 'account_changed' END,jsonb_build_object('role',NEW.role,'active',NEW.active,'old_role',CASE WHEN TG_OP='UPDATE' THEN OLD.role END));
 ELSE
  INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),TG_TABLE_NAME,record_id,lower(TG_OP));
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER document_audit AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION record_changes();
CREATE TRIGGER account_audit AFTER INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION record_changes();
CREATE TRIGGER template_audit AFTER INSERT OR UPDATE OR DELETE ON templates FOR EACH ROW EXECUTE FUNCTION record_changes();
CREATE TRIGGER asset_audit AFTER INSERT OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION record_changes();
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_read ON accounts FOR SELECT USING (id=actor_id() OR admin());
CREATE POLICY account_insert ON accounts FOR INSERT WITH CHECK(admin());
CREATE POLICY account_update ON accounts FOR UPDATE USING(admin()) WITH CHECK(admin());
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_read ON documents FOR SELECT USING (deleted_at IS NULL AND (staff() OR (actor_role()='employee' AND status='finalized')));
CREATE POLICY document_insert ON documents FOR INSERT WITH CHECK(staff() AND created_by=actor_id());
CREATE POLICY document_update ON documents FOR UPDATE USING(staff()) WITH CHECK(staff());
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_staff ON templates FOR ALL USING(staff()) WITH CHECK(staff());
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_read ON assets FOR SELECT USING (admin() OR (staff() AND (owner_id=actor_id() OR EXISTS(SELECT 1 FROM asset_grants WHERE asset_id=assets.id AND account_id=actor_id()))) OR EXISTS(SELECT 1 FROM document_assets da JOIN documents d ON d.id=da.document_id WHERE da.asset_id=assets.id));
CREATE POLICY asset_insert ON assets FOR INSERT WITH CHECK(staff() AND owner_id=actor_id());
CREATE POLICY asset_delete ON assets FOR DELETE USING(admin() OR (staff() AND owner_id=actor_id()));
ALTER TABLE asset_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY grants_read ON asset_grants FOR SELECT USING(staff());
CREATE POLICY grants_write ON asset_grants FOR ALL USING(admin()) WITH CHECK(admin());
ALTER TABLE document_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY links_read ON document_assets FOR SELECT USING(EXISTS(SELECT 1 FROM documents d WHERE d.id=document_id));
CREATE POLICY links_write ON document_assets FOR ALL USING(staff()) WITH CHECK(staff());
ALTER TABLE audit_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin ON audit_records FOR SELECT USING(admin());
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_admin ON invitations FOR ALL USING(admin()) WITH CHECK(admin());
ALTER TABLE auth_buckets ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION auth_lookup(address text) RETURNS TABLE(id uuid,password_hash text,active boolean) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT id,password_hash,active FROM accounts WHERE email=address$$;
CREATE FUNCTION session_lookup(token text) RETURNS TABLE(id uuid,email text,role text,csrf text) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$SELECT a.id,a.email,a.role,s.csrf FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=token AND s.expires_at>now() AND a.active$$;
CREATE FUNCTION session_create(account uuid,token text,csrf_value text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$INSERT INTO sessions(token_hash,account_id,csrf,expires_at) SELECT token,id,csrf_value,now()+interval '8 hours' FROM accounts WHERE id=account AND active$$;
CREATE FUNCTION session_remove(token text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$DELETE FROM sessions WHERE token_hash=token$$;
CREATE FUNCTION consume_limit(bucket text,maximum int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE used int;
BEGIN
 INSERT INTO auth_buckets(key,started_at,attempts) VALUES(bucket,now(),1) ON CONFLICT(key) DO UPDATE SET
  attempts=CASE WHEN auth_buckets.started_at<now()-interval '15 minutes' THEN 1 ELSE auth_buckets.attempts+1 END,
  started_at=CASE WHEN auth_buckets.started_at<now()-interval '15 minutes' THEN now() ELSE auth_buckets.started_at END RETURNING attempts INTO used;
 RETURN used<=maximum;
END $$;
CREATE FUNCTION accept_invitation(token text,hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE account uuid;
BEGIN
 SELECT account_id INTO account FROM invitations WHERE token_hash=token AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF account IS NULL THEN RETURN NULL; END IF;
 UPDATE accounts SET password_hash=hash,active=true WHERE id=account AND NOT active;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE invitations SET used_at=now() WHERE token_hash=token;
 RETURN account;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rimdan_runtime;
GRANT SELECT(id,email,role,active,created_at),INSERT,UPDATE ON accounts TO rimdan_runtime;
GRANT SELECT,INSERT,UPDATE ON documents TO rimdan_runtime;
GRANT SELECT,INSERT,DELETE ON assets,document_assets,asset_grants TO rimdan_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON templates,invitations TO rimdan_runtime;
GRANT SELECT ON audit_records TO rimdan_runtime;
GRANT EXECUTE ON FUNCTION actor_id(),actor_role(),staff(),admin(),auth_lookup(text),session_lookup(text),session_create(uuid,text,text),session_remove(text),consume_limit(text,int),accept_invitation(text,text) TO rimdan_runtime;
