BEGIN;
-- C248: 0204 serializes this update with the job lock before this trigger runs.
-- Expired pending uploads may pass the lock, but cannot become active afterwards.
CREATE FUNCTION app.guard_post_lock_upload_transition() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(prior,'')::uuid AND NOT pg_has_role(session_user,'jobguard_migration','USAGE')
  AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- C238 remains in serialize_final_check_evidence; never relax verified sources.
 IF OLD.state<>'verified' AND NEW.state IS DISTINCT FROM OLD.state AND NEW.state<>'rejected'
  AND EXISTS(SELECT 1 FROM app.final_account_lock l
   WHERE l.tenant_id=OLD.tenant_id AND l.job_id=OLD.job_id AND OLD.server_received_at<=l.locked_at) THEN
  RAISE EXCEPTION 'FINAL_CHECK_UPLOAD_TRANSITION_LOCKED' USING ERRCODE='55000';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(prior,''),true);
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_post_lock_upload_transition() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_post_lock_upload_transition() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
-- Alphabetically after a_final_check_inventory (tenant/identity checks and SHARE lock).
CREATE TRIGGER b_final_check_upload_transition BEFORE UPDATE ON app.evidence_upload
 FOR EACH ROW EXECUTE FUNCTION app.guard_post_lock_upload_transition();
COMMIT;
