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
  AND (current_setting('transaction_isolation')<>'read committed'
   OR EXISTS(SELECT 1 FROM app.final_account_lock l
   WHERE l.tenant_id=OLD.tenant_id AND l.job_id=OLD.job_id AND OLD.server_received_at<=l.locked_at)) THEN
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
-- C249: fixed snapshots cannot observe a lock committed after their first read.
-- Restate C238 unchanged except for the isolation refusal; retain owner and ACL.
CREATE OR REPLACE FUNCTION app.serialize_final_check_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(prior,'')::uuid AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- A shared marker identifies only this tenant/job's in-flight uploads on a bounded lock timeout.
 -- It never conflicts with another upload or acquires a business lock.
 IF TG_TABLE_NAME='evidence_upload' THEN
  PERFORM pg_advisory_xact_lock_shared(hashtext('final_check_upload:'||NEW.tenant_id::text),hashtext(NEW.job_id::text));
 END IF;
 -- SHARE matches the watchdog live guard and blocks the exclusive lock/freeze/publication
 -- without upgrading concurrent evidence commands from SHARE to UPDATE.
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
 IF TG_TABLE_NAME='evidence_upload' THEN
  IF TG_OP='UPDATE' AND OLD.state='verified' AND NEW.state IS DISTINCT FROM OLD.state
   AND (current_setting('transaction_isolation')<>'read committed'
    OR EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=OLD.tenant_id AND job_id=OLD.job_id)) THEN
   RAISE EXCEPTION 'FINAL_CHECK_VERIFIED_SOURCE_LOCKED' USING ERRCODE='55000';
  END IF;
  -- Preserve supplied receipts. A later insert cannot claim a place before an existing lock.
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND NEW.server_received_at<=locked_at) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='55000';
  ELSIF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.server_received_at,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.server_received_at,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.kind='original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.upload_id) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='23503'; END IF;
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(prior,''),true);RETURN NEW;
END $$;
ALTER FUNCTION app.serialize_final_check_evidence() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.serialize_final_check_evidence() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
COMMIT;
