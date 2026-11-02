ALTER TABLE accounts ADD CONSTRAINT active_password_required CHECK(NOT active OR password_hash IS NOT NULL);
CREATE OR REPLACE FUNCTION audit_output(document uuid,operation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT staff() OR operation NOT IN ('print','export') OR NOT EXISTS(SELECT 1 FROM documents WHERE id=document AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Output denied' USING ERRCODE='42501'; END IF;
 INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),'document',document,'document_'||operation);
END $$;
