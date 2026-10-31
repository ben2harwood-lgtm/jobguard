BEGIN;
-- Only queue identifiers at lock. No shadow reads, counts or results enter the builder transaction.
CREATE FUNCTION app.request_practice_final_check_on_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track tr
   ON (tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
   WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id
     AND j.practice_session_digest IS NOT NULL AND j.provenance<>'imported'
     AND tr.job_track='small_builder' AND tr.environment='synthetic_demo') THEN
  INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id)
    VALUES(NEW.id,NEW.tenant_id,NEW.job_id) ON CONFLICT(lock_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.request_practice_final_check_on_lock() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.request_practice_final_check_on_lock() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_request_after_lock AFTER INSERT ON app.final_account_lock
 FOR EACH ROW EXECUTE FUNCTION app.request_practice_final_check_on_lock();
COMMIT;
