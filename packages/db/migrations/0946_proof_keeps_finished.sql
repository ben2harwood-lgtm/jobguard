BEGIN;
-- REAL-PROOF-KEEPS-FINISHED: retain proof facts, but do not treat the
-- practice proof command as renewed site work. No grants or source writes change.
DO $patch$
DECLARE original text; changed text;
BEGIN
 original:=pg_get_functiondef('app.ch4_capture_site_source()'::regprocedure);
 changed:=replace(original,
  'actor uuid; marker app.job_work_state_event; seq bigint; prior_context text:=current_setting(''app.tenant_id'',true);',
  'actor uuid; marker app.job_work_state_event; seq bigint; prior_context text:=current_setting(''app.tenant_id'',true);
 stage_proof boolean:=false; proof_stage text; prior_stage_read text:=current_setting(''app.customer_stage_read'',true);');
 IF changed=original THEN RAISE EXCEPTION 'unexpected capture declaration'; END IF;
 original:=changed;
 changed:=replace(original,
  'IF marker.kind=''finished_on_site'' AND (r.received_at>marker.fact_at OR (r.received_at=marker.fact_at AND r.id>marker.id)) THEN',
  'IF r.source_kind IN(''photo'',''stage_completion'') THEN
  IF r.source_kind=''photo'' THEN
   evidence:=NEW;
  ELSE
   proof_stage:=NEW.stage;
   -- Reuse 0546''s tenant-scoped owner read; restore its prior setting.
   PERFORM set_config(''app.customer_stage_read'',''on'',true);
   SELECT e.* INTO evidence FROM app.evidence_link l
    JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.scope_item_id,e.id)=(l.tenant_id,l.job_id,l.scope_item_id,l.evidence_id)
    WHERE (l.tenant_id,l.job_id,l.scope_item_id,l.id)=(NEW.tenant_id,NEW.job_id,NEW.scope_item_id,NEW.evidence_link_id)
     AND l.required_evidence_type=e.evidence_type AND e.kind=''original'';
   PERFORM set_config(''app.customer_stage_read'',coalesce(prior_stage_read,''''),true);
  END IF;
  -- select_generated is a server command, recorded atomically with upload
  -- admission, before finalise. Neither the evidence label nor a client flag
  -- supplies proof purpose. Bind the exact upload, scope and required type.
  SELECT EXISTS(
   SELECT 1 FROM app.proof_application_response p
   JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(p.tenant_id,p.job_id,p.command_id)
   JOIN app.job j ON(j.tenant_id,j.id)=(u.tenant_id,u.job_id)
   WHERE (p.tenant_id,p.job_id,u.id,u.scope_item_id)=(r.tenant_id,r.job_id,evidence.upload_id,evidence.scope_item_id)
    AND j.practice_session_digest IS NOT NULL
    AND p.action=''select_generated'' AND p.command_type=''evidence.begin_upload''
    AND p.response->>''jobId''=r.job_id::text
    AND p.response->>''scopeItemId''=evidence.scope_item_id::text
    AND p.response#>>''{upload,id}''=u.id::text
    AND p.response->>''requiredEvidenceType''=evidence.evidence_type
    AND (r.source_kind=''photo'' OR p.response->>''stage''=proof_stage)
    AND p.created_at<=evidence.server_verified_at
    AND u.state=''verified'' AND u.expected_sha256=evidence.sha256
    AND u.object_version_id=evidence.object_version_id
  ) INTO stage_proof;
 END IF;
 IF NOT stage_proof AND marker.kind=''finished_on_site'' AND (r.received_at>marker.fact_at OR (r.received_at=marker.fact_at AND r.id>marker.id)) THEN');
 IF changed=original THEN RAISE EXCEPTION 'unexpected capture cancellation'; END IF;
 EXECUTE changed;
END $patch$;
COMMIT;
