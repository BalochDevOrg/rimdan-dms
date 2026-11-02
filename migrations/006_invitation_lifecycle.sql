ALTER TABLE accounts ADD COLUMN has_password boolean GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED;
GRANT SELECT(has_password) ON accounts TO rimdan_runtime;
CREATE TRIGGER invitation_audit AFTER INSERT OR UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION record_changes();
