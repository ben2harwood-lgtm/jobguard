BEGIN;
-- Serialize with the lock routine's existing variation locks. Final Check catches
-- deliberately acquire their first price and approval after the account is locked.
CREATE FUNCTION app.guard_variation_final_account_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE variation_kind text; variation_job uuid;
BEGIN
 SELECT v.origin,v.job_id INTO variation_kind,variation_job FROM app.variation v
 WHERE (v.tenant_id,v.job_id,v.id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) FOR UPDATE OF v;
 IF variation_kind IS DISTINCT FROM 'jobguard_catch' AND EXISTS(
  SELECT 1 FROM app.final_account_lock l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=variation_job
 ) THEN RAISE EXCEPTION 'VARIATION_LOCKED_BY_FINAL_ACCOUNT' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_variation_final_account_lock() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_variation_final_account_lock() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER variation_revision_final_account_lock BEFORE INSERT ON app.variation_revision FOR EACH ROW EXECUTE FUNCTION app.guard_variation_final_account_lock();
CREATE TRIGGER variation_approval_final_account_lock BEFORE INSERT ON app.variation_approval FOR EACH ROW EXECUTE FUNCTION app.guard_variation_final_account_lock();
COMMIT;
