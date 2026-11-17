BEGIN;
CREATE FUNCTION app.pin_recovery_timing_created_at() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- Ignore caller claims about the stored time.
 NEW.created_at:=transaction_timestamp();
 RETURN NEW;
END $$;
ALTER FUNCTION app.pin_recovery_timing_created_at() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pin_recovery_timing_created_at() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER a_recovery_timing_pin BEFORE INSERT ON app.recovery_case FOR EACH ROW EXECUTE FUNCTION app.pin_recovery_timing_created_at();
CREATE TRIGGER a_recovery_timing_pin BEFORE INSERT ON app.practice_feed_event FOR EACH ROW EXECUTE FUNCTION app.pin_recovery_timing_created_at();
COMMIT;
