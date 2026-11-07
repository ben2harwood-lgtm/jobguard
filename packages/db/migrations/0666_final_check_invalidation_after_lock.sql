BEGIN;

CREATE FUNCTION app.refuse_final_check_locked_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior text:=current_setting('app.tenant_id',true);
BEGIN
 -- Match the serializer's privileged maintenance path without trusting an arbitrary tenant.
 IF NEW.tenant_id IS DISTINCT FROM nullif(prior,'')::uuid
  AND NOT pg_has_role(session_user,'jobguard_migration','USAGE')
  AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- Use verify_final_check_run's non-excluded, original-object source binding,
 -- including sources finalized after the manifest froze a null evidence identity.
 IF EXISTS(
  SELECT 1 FROM app.final_account_lock l
  JOIN app.final_check_manifest m
   ON (m.tenant_id,m.job_id,m.lock_id,m.evidence_cutoff_at)=(l.tenant_id,l.job_id,l.id,l.locked_at)
  JOIN app.final_check_manifest_source s
   ON (s.tenant_id,s.job_id,s.manifest_id)=(m.tenant_id,m.job_id,m.id)
  JOIN app.evidence_upload u
   ON (u.tenant_id,u.job_id,u.id,u.server_received_at)=(s.tenant_id,s.job_id,s.upload_id,s.source_received_at)
  JOIN app.evidence_object e
   ON (e.tenant_id,e.job_id,e.upload_id)=(u.tenant_id,u.job_id,u.id)
  WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.evidence_id
   AND s.excluded_state IS NULL AND u.state='verified' AND e.kind='original'
   AND e.sha256=u.expected_sha256 AND e.object_version_id=u.object_version_id
   AND e.server_received_at<=m.evidence_cutoff_at
   AND (s.evidence_id IS NULL OR
    (e.id,e.object_version_id,e.sha256,e.server_received_at)=
    (s.evidence_id,s.object_version_id,s.sha256,s.evidence_received_at))
   -- Only until the final invoice is issued (the issue functions' own final-invoice rule).
   -- After that, a withdrawal no longer strands final invoice issue, and C135 recovery
   -- flows (evidence packs, pursuit, allocations) depend on post-lock withdrawal.
   AND NOT EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b
    ON (b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id)
    WHERE i.tenant_id=l.tenant_id AND i.job_id=l.job_id AND coalesce(b.invoice_kind,'final')='final')
 ) THEN
  RAISE EXCEPTION 'FINAL_CHECK_VERIFIED_SOURCE_LOCKED' USING ERRCODE='55000';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(prior,''),true);
 RETURN NEW;
END $$;
ALTER FUNCTION app.refuse_final_check_locked_invalidation() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.refuse_final_check_locked_invalidation()
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

-- BEFORE triggers run by name: a_final_check_invalidation takes the job SHARE
-- lock first; this refusal observes the lock/manifest only after that serialization.
CREATE TRIGGER b_final_check_locked_invalidation BEFORE INSERT ON app.evidence_invalidation
 FOR EACH ROW EXECUTE FUNCTION app.refuse_final_check_locked_invalidation();

COMMIT;
