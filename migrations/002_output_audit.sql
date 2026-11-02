CREATE FUNCTION audit_output(document uuid,operation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT staff() OR operation NOT IN ('print','export') THEN RAISE EXCEPTION 'Output denied' USING ERRCODE='42501'; END IF;
 INSERT INTO audit_records(actor_id,entity,entity_id,action) VALUES(actor_id(),'document',document,'document_'||operation);
END $$;
REVOKE ALL ON FUNCTION audit_output(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_output(uuid,text) TO rimdan_runtime;
