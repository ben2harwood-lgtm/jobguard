BEGIN;
-- M4-6-store: additive synthetic history; no scheduling owner, clock or commercial routine changes.
CREATE TABLE app.recovery_timeline_run (
 tenant_id uuid NOT NULL, follow_up_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, run_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('waiting','review','stopped')),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,follow_up_id),
 FOREIGN KEY(tenant_id,job_id,case_id,follow_up_id) REFERENCES app.recovery_follow_up(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,follow_up_id,run_id) REFERENCES app.recovery_follow_up(tenant_id,id,run_id)
);
CREATE TABLE app.recovery_timeline_signal (
 tenant_id uuid NOT NULL, signal_id uuid NOT NULL, follow_up_id uuid NOT NULL,
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(tenant_id,signal_id),
 FOREIGN KEY(tenant_id,follow_up_id) REFERENCES app.recovery_timeline_run(tenant_id,follow_up_id)
);
CREATE FUNCTION app.guard_recovery_timeline_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='stopped' AND NEW.state<>'stopped' THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_STOPPED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_timeline_state_guard BEFORE UPDATE ON app.recovery_timeline_run
 FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_timeline_state();
ALTER FUNCTION app.guard_recovery_timeline_state() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_recovery_timeline_state() FROM PUBLIC,jobguard_runtime;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_timeline_run','recovery_timeline_signal'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;
-- Runtime cannot pre-seed fingerprints by writing the table directly.
REVOKE INSERT ON app.recovery_timeline_signal FROM jobguard_runtime;
CREATE FUNCTION app.record_recovery_timeline_signal(p_tenant uuid,p_signal uuid,p_follow_up uuid,p_fingerprint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_database()<>'jobguard_synthetic_demo'
    OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
    OR p_tenant IS NULL THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_timeline_run r
   JOIN app.recovery_follow_up f ON (f.tenant_id,f.id,f.job_id,f.case_id,f.run_id)=
     (r.tenant_id,r.follow_up_id,r.job_id,r.case_id,r.run_id)
   WHERE r.tenant_id=p_tenant AND r.follow_up_id=p_follow_up) THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 INSERT INTO app.recovery_timeline_signal(tenant_id,signal_id,follow_up_id,fingerprint)
 VALUES(p_tenant,p_signal,p_follow_up,p_fingerprint);
END $$;
ALTER FUNCTION app.record_recovery_timeline_signal(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_recovery_timeline_signal(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime;
-- The legacy hash-accepting helper is owner-only, including after a run exists.
REVOKE INSERT,UPDATE ON app.recovery_timeline_run FROM jobguard_runtime;
CREATE FUNCTION app.apply_recovery_timeline_signal(p_tenant uuid,p_signal jsonb)
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
       AND j.provenance='imported' AND j.practice_session_digest IS NULL
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
