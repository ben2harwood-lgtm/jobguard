BEGIN;
CREATE OR REPLACE FUNCTION app.apply_recovery_timeline_signal(p_tenant uuid,p_signal jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 f app.recovery_follow_up%ROWTYPE;
 incoming_signal_id uuid; event_id uuid; signal_kind text; fingerprint text; previous_hash text; next_state text;
 session_digest text := nullif(current_setting('app.practice_material_digest',true),'');
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR p_tenant IS NULL
    OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- No fingerprint, state or arbitrary extra field is an input to this boundary.
 IF p_signal IS NULL OR jsonb_typeof(p_signal) IS DISTINCT FROM 'object'
    OR NOT (p_signal ?& ARRAY['version','signalId','eventId','kind','ref'])
    OR p_signal - ARRAY['version','signalId','eventId','kind','ref'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p_signal - 'ref') e WHERE jsonb_typeof(e.value)<>'string')
    OR p_signal->>'version' NOT IN ('recovery-timeline-signal.v1','recovery-timeline-signal.v2')
    OR p_signal->>'kind' NOT IN ('timer','builder_response','evidence_complete','cancel','close')
    OR jsonb_typeof(p_signal->'ref') IS DISTINCT FROM 'object'
    OR NOT ((p_signal->'ref') ?& ARRAY['tenantId','jobId','caseId','runId','followUpId'])
    OR (p_signal->'ref') - ARRAY['tenantId','jobId','caseId','runId','followUpId'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p_signal->'ref') e WHERE jsonb_typeof(e.value)<>'string') THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 incoming_signal_id := (p_signal->>'signalId')::uuid;
 event_id := (p_signal->>'eventId')::uuid;
 signal_kind := p_signal->>'kind';
 IF incoming_signal_id IS NULL OR event_id IS NULL OR signal_kind IS NULL THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('recovery-timeline:'||p_tenant||':signal:'||incoming_signal_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('recovery-timeline:'||p_tenant||':intent:'||(p_signal->'ref'->>'followUpId')::uuid,0));
 SELECT * INTO f FROM app.recovery_follow_up
 WHERE tenant_id=p_tenant AND id=(p_signal->'ref'->>'followUpId')::uuid;
 IF NOT FOUND OR f.environment<>'synthetic_demo'
    OR (p_signal->'ref'->>'tenantId')::uuid IS DISTINCT FROM f.tenant_id
    OR (p_signal->'ref'->>'jobId')::uuid IS DISTINCT FROM f.job_id
    OR (p_signal->'ref'->>'caseId')::uuid IS DISTINCT FROM f.case_id
    OR (p_signal->'ref'->>'runId')::uuid IS DISTINCT FROM f.run_id THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 -- Reuse the existing persisted practice-session and immutable ownership checks.
 -- A tenant setting or an invented digest alone cannot authorize a history write.
 IF session_digest IS NULL OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(session_digest,p_tenant))
    OR NOT EXISTS(
     WITH RECURSIVE owned_job AS (
      SELECT j.id FROM app.job j WHERE j.tenant_id=p_tenant AND j.practice_session_digest=session_digest
      UNION
      SELECT j.id FROM owned_job source
      JOIN app.audit_event e ON e.tenant_id=p_tenant AND e.subject_type='job'
       AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
      JOIN app.job j ON j.tenant_id=e.tenant_id AND j.id::text=e.subject_ref
       AND j.provenance='imported' AND j.practice_session_digest IS NULL AND (EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=p_tenant AND iv.job_id=j.id AND iv.source_job_id=source.id) OR EXISTS(SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=p_tenant AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded' AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text AND rv.result->>'sourceJobId'=source.id::text))
     ) SELECT 1 FROM owned_job WHERE id=f.job_id
    ) THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- References come from the immutable follow-up, not a caller-supplied run/hash/state.
 fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'version','recovery-timeline-signal.v2','signalId',incoming_signal_id,'eventId',event_id,'kind',signal_kind,
  'ref',jsonb_build_object('tenantId',f.tenant_id,'jobId',f.job_id,'caseId',f.case_id,
    'runId',f.run_id,'followUpId',f.id))::text,'UTF8')),'hex');
 SELECT s.fingerprint INTO previous_hash FROM app.recovery_timeline_signal s
 WHERE s.tenant_id=p_tenant AND s.signal_id=incoming_signal_id;
 IF previous_hash IS NOT NULL AND previous_hash<>fingerprint THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_CONFLICT' USING ERRCODE='23514';
 END IF;
 next_state := CASE
  WHEN app.recovery_follow_up_stop_reason(p_tenant,f.id) IS NOT NULL THEN 'stopped'
  WHEN EXISTS(SELECT 1 FROM app.recovery_follow_up_due d WHERE d.tenant_id=p_tenant AND d.follow_up_id=f.id) THEN 'review'
  ELSE 'waiting' END;
 INSERT INTO app.recovery_timeline_run AS r(tenant_id,follow_up_id,job_id,case_id,run_id,state)
 VALUES(p_tenant,f.id,f.job_id,f.case_id,f.run_id,next_state)
 ON CONFLICT(tenant_id,follow_up_id) DO UPDATE SET state=CASE WHEN r.state='stopped' THEN 'stopped' ELSE excluded.state END
 RETURNING state INTO next_state;
 IF previous_hash IS NULL THEN
  PERFORM app.record_recovery_timeline_signal(p_tenant,incoming_signal_id,f.id,fingerprint);
 END IF;
 RETURN next_state;
END $$;
ALTER FUNCTION app.apply_recovery_timeline_signal(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.apply_recovery_timeline_signal(uuid,jsonb) FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.apply_recovery_timeline_signal(uuid,jsonb) TO jobguard_runtime;
COMMIT;
