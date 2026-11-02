CREATE FUNCTION revoke_deactivated_sessions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.active AND NOT NEW.active THEN
  DELETE FROM sessions WHERE account_id=NEW.id;
  UPDATE invitations SET used_at=now() WHERE account_id=NEW.id AND used_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION revoke_deactivated_sessions() FROM PUBLIC;
CREATE TRIGGER account_session_revocation AFTER UPDATE OF active ON accounts FOR EACH ROW EXECUTE FUNCTION revoke_deactivated_sessions();
