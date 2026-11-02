-- New asset attachments must be explicitly authorized; retained attachments need
-- not be removed/reinserted when another manager edits the document's text.
CREATE FUNCTION can_apply_asset(asset uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT staff() AND EXISTS(SELECT 1 FROM assets a WHERE a.id=asset AND (admin() OR a.owner_id=actor_id() OR EXISTS(SELECT 1 FROM asset_grants g WHERE g.asset_id=a.id AND g.account_id=actor_id())))
$$;
REVOKE ALL ON FUNCTION can_apply_asset(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_apply_asset(uuid) TO rimdan_runtime;
DROP POLICY links_write ON document_assets;
CREATE POLICY links_insert ON document_assets FOR INSERT WITH CHECK(staff() AND can_apply_asset(asset_id));
CREATE POLICY links_delete ON document_assets FOR DELETE USING(staff());
-- Null JSON mark slots are absence, not a signing action.
CREATE OR REPLACE FUNCTION record_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE action_name text; record_id uuid; old_marks jsonb;
BEGIN
 record_id=coalesce(NEW.id,OLD.id);
 IF TG_TABLE_NAME='documents' THEN
  action_name=CASE WHEN TG_OP='INSERT' THEN 'document_created' WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'document_deleted' WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'document_'||NEW.status ELSE 'document_modified' END;
  INSERT INTO audit_records(actor_id,entity,entity_id,action,detail) VALUES(actor_id(),'document',record_id,action_name,jsonb_build_object('version',NEW.version,'status',NEW.status));
  old_marks=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE OLD.content->'marks' END;
  IF nullif(NEW.content->'marks'->'signature','null'::jsonb) IS DISTINCT FROM nullif(old_marks->'signature','null'::jsonb) THEN
   INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),'document',record_id,'document_signing_changed');
  END IF;
  IF nullif(NEW.content->'marks'->'stamp','null'::jsonb) IS DISTINCT FROM nullif(old_marks->'stamp','null'::jsonb) THEN
   INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),'document',record_id,'document_stamping_changed');
  END IF;
 ELSIF TG_TABLE_NAME='accounts' THEN
  INSERT INTO audit_records(actor_id,entity,entity_id,action,detail) VALUES(actor_id(),'account',record_id,CASE WHEN TG_OP='INSERT' THEN 'account_created' ELSE 'account_changed' END,jsonb_build_object('role',NEW.role,'active',NEW.active,'old_role',CASE WHEN TG_OP='UPDATE' THEN OLD.role END));
 ELSE INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),TG_TABLE_NAME,record_id,lower(TG_OP));
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
