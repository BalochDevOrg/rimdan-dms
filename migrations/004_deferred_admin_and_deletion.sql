-- Deferred checks execute at commit outside the caller's definer function. Count
-- all administrator rows under the migration owner, independent of caller RLS.
CREATE OR REPLACE FUNCTION enforce_administrator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF (SELECT count(*) FROM accounts WHERE active AND role='administrator')<>1 THEN
  RAISE EXCEPTION 'Exactly one active administrator is required' USING ERRCODE='23514';
 END IF; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION enforce_administrator() FROM PUBLIC;
-- Soft deletion intentionally makes the updated row unreadable under RLS. A
-- narrowly scoped function handles that transition, retaining audit/asset history.
CREATE FUNCTION delete_document(document uuid,revision int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT staff() THEN RAISE EXCEPTION 'Deletion denied' USING ERRCODE='42501'; END IF;
 UPDATE documents SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=document AND deleted_at IS NULL AND version=revision;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION delete_document(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_document(uuid,int) TO rimdan_runtime;
