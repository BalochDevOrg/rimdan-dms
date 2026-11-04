-- Rimdan Phase 3: restricted per-document audiences and administrator-assisted
-- one-time password recovery. Forward-only, intended for owner-operated migration.
-- Existing documents remain 'all' exactly as their previous reader visibility.
ALTER TABLE public.documents
  ADD COLUMN audience text NOT NULL DEFAULT 'all'
  CONSTRAINT document_audience_valid CHECK (audience IN ('all','selected'));
CREATE TABLE public.document_recipients (
 document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 granted_at timestamptz NOT NULL DEFAULT now(),
 granted_by uuid REFERENCES public.accounts(id),
 PRIMARY KEY(document_id,account_id)
);
CREATE INDEX document_recipients_by_account ON public.document_recipients(account_id,document_id);
CREATE TABLE public.password_resets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES public.accounts(id)
);
CREATE INDEX password_resets_active ON public.password_resets(account_id,expires_at) WHERE used_at IS NULL;
ALTER TABLE public.document_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
-- SECURITY DEFINER owns its table reads and must be created by migration owner.
-- The actor identity is always transaction-local and set by the trusted server.
CREATE FUNCTION public.can_access_document(
 target uuid, owner uuid, state text, visibility text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE
 WHEN actor_role()='administrator' THEN true
 WHEN actor_role()='manager' THEN
   visibility='all' OR owner=actor_id() OR EXISTS(
    SELECT 1 FROM public.document_recipients
    WHERE document_id=target AND account_id=actor_id())
 WHEN actor_role()='employee' THEN
   state='finalized' AND (visibility='all' OR EXISTS(
    SELECT 1 FROM public.document_recipients
    WHERE document_id=target AND account_id=actor_id()))
 ELSE false END
$$;
CREATE FUNCTION public.can_manage_document(target uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT actor_role()='administrator' OR
   (actor_role()='manager' AND EXISTS(
    SELECT 1 FROM public.documents d WHERE d.id=target
      AND d.deleted_at IS NULL
      AND (d.audience='all' OR d.created_by=actor_id()
        OR EXISTS(SELECT 1 FROM public.document_recipients r
          WHERE r.document_id=d.id AND r.account_id=actor_id()))))
$$;
-- Restrict document reads/updates at the database boundary, not only in UI.
DROP POLICY document_read ON public.documents;
CREATE POLICY document_read ON public.documents FOR SELECT USING (
 deleted_at IS NULL AND can_access_document(id,created_by,status,audience));
DROP POLICY document_update ON public.documents;
CREATE POLICY document_update ON public.documents FOR UPDATE
 USING (staff() AND can_manage_document(id))
 WITH CHECK (staff() AND can_manage_document(id));
CREATE POLICY recipients_read ON public.document_recipients FOR SELECT
 USING (staff() AND can_manage_document(document_id));
CREATE POLICY recipients_insert ON public.document_recipients FOR INSERT
 WITH CHECK (staff() AND can_manage_document(document_id));
CREATE POLICY recipients_delete ON public.document_recipients FOR DELETE
 USING (staff() AND can_manage_document(document_id));
CREATE FUNCTION public.list_share_targets()
 RETURNS TABLE(id uuid,email text,role text) LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT a.id,a.email,a.role FROM public.accounts a
 WHERE staff() AND a.active AND a.role IN ('manager','employee')
 ORDER BY a.email
$$;
CREATE FUNCTION public.issue_password_reset(target uuid, secret_hash text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT admin() OR length(secret_hash)<>64 THEN
   RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=target AND active) THEN RETURN false; END IF;
 UPDATE public.password_resets SET used_at=now()
   WHERE account_id=target AND used_at IS NULL;
 INSERT INTO public.password_resets(account_id,token_hash,expires_at,created_by)
 VALUES(target,secret_hash,now()+interval '30 minutes',actor_id());
 INSERT INTO public.audit_records(actor_id,entity,entity_id,action)
 VALUES(actor_id(),'account',target,'password_reset_issued');
 RETURN true;
END $$;
CREATE FUNCTION public.redeem_password_reset(secret_hash text,new_hash text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE chosen uuid;
BEGIN
 IF length(secret_hash)<>64 OR new_hash NOT LIKE 'scrypt-131072:%' THEN
   RETURN false;
 END IF;
 SELECT account_id INTO chosen FROM public.password_resets
 WHERE token_hash=secret_hash AND used_at IS NULL AND expires_at>now()
 FOR UPDATE;
 IF chosen IS NULL THEN RETURN false; END IF;
 UPDATE public.password_resets SET used_at=now()
   WHERE account_id=chosen AND used_at IS NULL;
 UPDATE public.accounts SET password_hash=new_hash WHERE id=chosen AND active;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.sessions WHERE account_id=chosen;
 INSERT INTO public.audit_records(actor_id,entity,entity_id,action)
 VALUES(NULL,'account',chosen,'password_reset_completed');
 RETURN true;
END $$;
CREATE FUNCTION public.audit_recipient_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 INSERT INTO public.audit_records(actor_id,entity,entity_id,action,detail)
 VALUES(actor_id(),'document',CASE WHEN TG_OP='DELETE' THEN OLD.document_id ELSE NEW.document_id END,
  CASE WHEN TG_OP='DELETE' THEN 'document_recipient_removed' ELSE 'document_recipient_added' END,
  jsonb_build_object('account_id',CASE WHEN TG_OP='DELETE' THEN OLD.account_id ELSE NEW.account_id END));
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER document_recipients_audit AFTER INSERT OR DELETE
 ON public.document_recipients FOR EACH ROW EXECUTE FUNCTION public.audit_recipient_change();
-- Narrow existing owner helper operations to the same document access boundary.
CREATE OR REPLACE FUNCTION public.delete_document(document uuid,revision int)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT staff() OR NOT can_manage_document(document) THEN
   RAISE EXCEPTION 'Deletion denied' USING ERRCODE='42501';
 END IF;
 UPDATE public.documents SET deleted_at=now(),version=version+1,updated_at=now()
 WHERE id=document AND deleted_at IS NULL AND version=revision;
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.audit_output(document uuid,operation text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT staff() OR NOT can_manage_document(document) OR operation NOT IN ('print','export')
    OR NOT EXISTS(SELECT 1 FROM public.documents WHERE id=document AND deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Output denied' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.audit_records(actor_id,entity,entity_id,action)
 VALUES(actor_id(),'document',document,'document_'||operation);
END $$;
-- Explicit future-proof ACLs for Supabase API roles and PUBLIC.
REVOKE ALL ON public.document_recipients,public.password_resets FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_document(uuid,uuid,text,text),
 public.can_manage_document(uuid),public.list_share_targets(),
 public.issue_password_reset(uuid,text),public.redeem_password_reset(text,text),
 public.audit_recipient_change() FROM PUBLIC;
DO $acl$
DECLARE api_role text;
BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
   EXECUTE format('REVOKE ALL ON public.document_recipients,public.password_resets FROM %I',api_role);
   EXECUTE format('REVOKE ALL ON FUNCTION public.can_access_document(uuid,uuid,text,text),public.can_manage_document(uuid),public.list_share_targets(),public.issue_password_reset(uuid,text),public.redeem_password_reset(text,text),public.audit_recipient_change() FROM %I',api_role);
  END IF;
 END LOOP;
END $acl$;
GRANT SELECT,INSERT,DELETE ON public.document_recipients TO rimdan_runtime;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid,uuid,text,text),
 public.can_manage_document(uuid),public.list_share_targets(),
 public.issue_password_reset(uuid,text),public.redeem_password_reset(text,text)
 TO rimdan_runtime;
-- No runtime table access to password_resets or unrestricted audit inserts.
