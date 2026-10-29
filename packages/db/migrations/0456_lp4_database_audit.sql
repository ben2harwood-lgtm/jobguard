-- LP-4 part 1 RED: dark in-database audit append, synthetic database only.
-- Full LP-4 authority guarantee REFUSED: reserved generic types and authority
-- consumers are NOT closed here. No production/real-data enablement.
-- Forward-only candidate: no history is rewritten.
BEGIN;
CREATE ROLE jobguard_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA app, audit_control TO jobguard_audit_writer;
GRANT SELECT, INSERT ON app.audit_event TO jobguard_audit_writer;
GRANT SELECT, INSERT, UPDATE ON audit_control.audit_head TO jobguard_audit_writer;
GRANT EXECUTE ON FUNCTION app.final_lock_canonical(jsonb) TO jobguard_audit_writer;
ALTER TABLE app.audit_event DROP CONSTRAINT audit_event_version_check;
ALTER TABLE app.audit_event ADD CONSTRAINT audit_event_version_check CHECK(version IN ('audit.v1','audit.v2'));
CREATE POLICY lp4_audit_writer ON app.audit_event FOR ALL TO jobguard_audit_writer
 USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

-- Private sealing primitive. Only checked owner operations may select checked_operation.
-- It acquires no business locks. The head is the caller's last contending lock.
CREATE FUNCTION app.lp4_seal_audit(p_events jsonb, p_trust text) RETURNS SETOF app.audit_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 e jsonb; payload jsonb; section text; entry record; seq bigint; prev text; ts timestamptz;
 ph text; eh text; stored app.audit_event;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'LP4_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF t IS NULL THEN RAISE EXCEPTION 'AUDIT_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_trust IS NULL OR p_trust NOT IN ('lower_trust','checked_operation')
  OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_events)=0 THEN RETURN; END IF;
 -- Validate the WHOLE batch before the head wait. Errors contain no caller input.
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object'
   OR e - ARRAY['id','version','actorRef','eventType','subjectType','subjectRef','payload'] <> '{}'::jsonb
   OR NOT (e ?& ARRAY['id','version','actorRef','eventType','subjectType','subjectRef','payload'])
   OR e->>'version' IS DISTINCT FROM 'audit.v1' THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH section IN ARRAY ARRAY['id','actorRef','eventType','subjectType','subjectRef'] LOOP
   IF jsonb_typeof(e->section) IS DISTINCT FROM 'string' OR length(e->>section) NOT BETWEEN 1 AND 200
    OR (e->>section) !~ '^[A-Za-z0-9_.:@/-]+$'
    OR (e->>section) ~ '@[^@]*[.]' THEN
    RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (e->>'id') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
   OR length(e->>'eventType')>100 OR length(e->>'subjectType')>100 THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  payload:=e->'payload';
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
   OR payload - ARRAY['references','hashes','classifications'] <> '{}'::jsonb THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH section IN ARRAY ARRAY['references','hashes','classifications'] LOOP
   IF payload ? section THEN
    IF jsonb_typeof(payload->section) IS DISTINCT FROM 'object' THEN
     RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    FOR entry IN SELECT key,value FROM jsonb_each(payload->section) LOOP
     IF length(entry.key) NOT BETWEEN 1 AND 200 OR entry.key !~ '^[A-Za-z0-9_.:@/-]+$'
      OR entry.key IN ('auditTrust','tenantId','id','version','actorRef','eventType','subjectType','subjectRef','sequence','occurredAt','previousHash','eventHash')
      OR jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
      OR length(entry.value #>> '{}') NOT BETWEEN 1 AND 200
      OR (entry.value #>> '{}') !~ '^[A-Za-z0-9_.:@/-]+$'
      OR (entry.value #>> '{}') ~ '@[^@]*[.]' THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
     IF section='hashes' AND (entry.value #>> '{}') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
     IF section='classifications' AND (entry.value #>> '{}') NOT IN ('operational','commercial','financial','security') THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 INSERT INTO audit_control.audit_head(tenant_id) VALUES(t) ON CONFLICT DO NOTHING;
 SELECT h.sequence,h.event_hash INTO seq,prev FROM audit_control.audit_head h WHERE h.tenant_id=t FOR UPDATE;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  seq:=seq+1;
  ts:=date_trunc('milliseconds',clock_timestamp());
  payload:=jsonb_set(e->'payload','{references}',coalesce(e->'payload'->'references','{}'::jsonb)||jsonb_build_object('auditTrust',p_trust));
  ph:=encode(sha256(convert_to(app.final_lock_canonical(payload),'UTF8')),'hex');
  eh:=encode(sha256(convert_to(array_to_string(ARRAY['audit.v2',(e->>'id')::uuid::text,t::text,seq::text,e->>'actorRef',e->>'eventType',
    e->>'subjectType',e->>'subjectRef',to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')],chr(31)),'UTF8')),'hex');
  INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
   VALUES((e->>'id')::uuid,t,seq,'audit.v2',e->>'actorRef',e->>'eventType',e->>'subjectType',e->>'subjectRef',ts,payload,ph,prev,eh)
   RETURNING * INTO stored;
  RETURN NEXT stored;
  prev:=eh;
 END LOOP;
 UPDATE audit_control.audit_head SET sequence=seq,event_hash=prev WHERE tenant_id=t;
END $$;
ALTER FUNCTION app.lp4_seal_audit(jsonb,text) OWNER TO jobguard_audit_writer;
REVOKE ALL ON FUNCTION app.lp4_seal_audit(jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.lp4_seal_audit(jsonb,text) TO jobguard_migration;
CREATE FUNCTION app.append_audit(p_events jsonb) RETURNS SETOF app.audit_event
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT * FROM app.lp4_seal_audit(p_events,'lower_trust')
$$;
ALTER FUNCTION app.append_audit(jsonb) OWNER TO jobguard_audit_writer;
REVOKE ALL ON FUNCTION app.append_audit(jsonb) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.append_audit(jsonb) TO jobguard_runtime,jobguard_migration;
REVOKE INSERT ON app.audit_event FROM jobguard_runtime;
REVOKE ALL ON FUNCTION app.lock_audit_head(),app.advance_audit_head(bigint,char(64)) FROM jobguard_runtime;
REVOKE ALL ON FUNCTION identity.sso_audit_head(uuid) FROM jobguard_identity;

CREATE OR REPLACE FUNCTION app.append_shadow_audit(p_event uuid,p_job uuid,p_type text,p_reason_hash text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE payload jsonb; actor text:='role:'||session_user;
BEGIN
 IF p_type IS NULL OR p_type NOT IN ('shadow.reveal_requested','shadow.disclosed','shadow.emergency_read') THEN
  RAISE EXCEPTION 'invalid shadow audit' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('references',jsonb_build_object('eventId',p_event,'jobId',p_job));
 IF p_reason_hash IS NOT NULL THEN payload:=payload||jsonb_build_object('hashes',jsonb_build_object('reason',p_reason_hash)); END IF;
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',p_event,'version','audit.v1','actorRef',actor,'eventType',p_type,'subjectType','job','subjectRef',p_job::text,'payload',payload)),'checked_operation');
END $$;
CREATE OR REPLACE FUNCTION app.append_final_lock_audit(p_event uuid,p_actor uuid,p_subject uuid,p_type text,p_refs jsonb,p_hashes jsonb DEFAULT '{}'::jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_type IS NULL OR p_type NOT IN ('final_account.locked','final_account.disposition_recorded','final_check.terms_accepted','customer_invoice.lock_bound_issued') THEN
  RAISE EXCEPTION 'invalid final lock audit' USING ERRCODE='22023'; END IF;
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',p_event,'version','audit.v1','actorRef','membership:'||p_actor::text,'eventType',p_type,'subjectType','job','subjectRef',p_subject::text,'payload',jsonb_build_object('references',p_refs,'hashes',p_hashes))),'checked_operation');
END $$;
CREATE OR REPLACE FUNCTION app.surface_shadow_signal_early(
 p_tenant uuid,p_job uuid,p_signal uuid,p_firing uuid,p_decision uuid,p_disclosure uuid,
 p_rule text,p_version text,p_source uuid,p_object_version text,p_facts jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app.shadow_commercial_signal; prior app.shadow_must_surface_firing;
 request_hash text;finding uuid:=p_firing;audit_id uuid:=p_firing;locked boolean:=false;
 seq bigint;prev text;ts timestamptz;payload_text text;ph text;eh text;actor text:='role:'||session_user;fired boolean;terms_accepted boolean;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_job IS NULL OR p_signal IS NULL OR p_firing IS NULL OR p_decision IS NULL OR p_disclosure IS NULL OR p_source IS NULL
  OR p_firing=p_disclosure OR p_version IS DISTINCT FROM 'shadow_attribution_policy_v3'
  OR p_rule IS NULL OR p_rule NOT IN('safety','prior_written_agreement','worsening_dispute','disclosure_duty')
  OR p_object_version IS NULL OR length(p_object_version) NOT BETWEEN 1 AND 300
  OR p_facts IS NULL OR jsonb_typeof(p_facts)<>'object' THEN RAISE EXCEPTION 'invalid must-surface firing' USING ERRCODE='22023'; END IF;
 -- Structured facts, never confidence, model recommendation or a value threshold.
 IF NOT p_facts ?& ARRAY['workReference','scopeArea','description','status','estimatedValuePence','safetyImplication','customerClearlyRequested','needsPriorWrittenAgreement','significantWork','activeDispute','silenceMateriallyWorsensDispute','disclosureDuty']
  OR (SELECT count(*) FROM jsonb_object_keys(p_facts))<>12
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['safetyImplication','customerClearlyRequested','needsPriorWrittenAgreement','activeDispute','silenceMateriallyWorsensDispute','disclosureDuty']) k WHERE jsonb_typeof(p_facts->k)<>'boolean') THEN
  RAISE EXCEPTION 'invalid structured rule facts' USING ERRCODE='22023';
 END IF;
 fired:=CASE p_rule WHEN 'safety' THEN (p_facts->>'safetyImplication')::boolean
  WHEN 'prior_written_agreement' THEN (p_facts->>'customerClearlyRequested')::boolean AND (p_facts->>'needsPriorWrittenAgreement')::boolean
   AND p_facts->'significantWork'->>'basis'='synthetic_fixture' AND p_facts->'significantWork'->>'significant'='true'
  WHEN 'worsening_dispute' THEN (p_facts->>'activeDispute')::boolean AND (p_facts->>'silenceMateriallyWorsensDispute')::boolean
  WHEN 'disclosure_duty' THEN (p_facts->>'disclosureDuty')::boolean END;
 IF fired IS DISTINCT FROM true THEN RAISE EXCEPTION 'rule did not fire' USING ERRCODE='23514'; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_job,p_signal,p_firing,p_decision,p_disclosure,p_rule,p_version,p_source,p_object_version,p_facts,actor)::text,'UTF8')),'hex');
 -- Consistent order: job, signal, all immutable business inserts, disclosure, audit head last.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO s FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO prior FROM app.shadow_must_surface_firing WHERE tenant_id=p_tenant AND
  (id=p_firing OR (job_id=p_job AND signal_id=p_signal AND rule=p_rule AND rule_version=p_version AND source_ref=p_source));
 IF FOUND THEN
  IF prior.request_hash<>request_hash THEN RAISE EXCEPTION 'must-surface replay conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.decision_id;
 END IF;
 -- 0129 installs before SV-4 (0130); resolve its relation only at execution.
 -- No new privilege for the shadow login: only this migration-owned routine reads terms.
 IF to_regclass('app.final_check_terms_acceptance') IS NULL THEN
  RAISE EXCEPTION 'TERMS_RELATION_UNAVAILABLE' USING ERRCODE='55000';
 END IF;
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=$1 AND terms_version=$2)'
  INTO terms_accepted USING p_tenant,'synthetic_final_check_terms.v1';
 IF terms_accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'TERMS_NOT_ACCEPTED' USING ERRCODE='55000'; END IF;
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job;
 END IF;
 IF locked THEN RAISE EXCEPTION 'early surface requires an unlocked job' USING ERRCODE='55000'; END IF;
 IF s.coalesced_into_signal_id IS NOT NULL OR s.state NOT IN('candidate','held_for_final_check','surfaced_early') THEN
  RAISE EXCEPTION 'invalid early-surface subject' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM app.shadow_signal_evidence WHERE tenant_id=p_tenant AND job_id=p_job AND signal_id=p_signal AND evidence_id=p_source AND object_version_id=p_object_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow source mismatch' USING ERRCODE='23503'; END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(p_decision,p_tenant,'shadow_signal',p_signal::text,'review_must_surface_signal');
 -- Q4 wording remains held: stored description is the title; no invented reason or money display.
 INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision)
 VALUES(finding,p_tenant,p_job,p_decision,request_hash,'must_surface_signal','mandatory',left(s.description,160),'',p_signal::text,'review_must_surface_signal',s.revision);
 INSERT INTO app.shadow_must_surface_firing(tenant_id,job_id,id,signal_id,rule,rule_version,source_ref,object_version_id,decision_id,finding_id,disclosure_event_id,audit_event_id,facts,request_hash,actor_ref)
 VALUES(p_tenant,p_job,p_firing,p_signal,p_rule,p_version,p_source,p_object_version,p_decision,finding,p_disclosure,audit_id,p_facts,request_hash,actor);
 -- SV-2 owns disclosure, monotonic provenance and its audit event. No business locks after this call.
 PERFORM app.record_shadow_disclosure(p_tenant,p_job,p_signal,p_disclosure,'must_surface_override');
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',audit_id,'version','audit.v1','actorRef',actor,'eventType','shadow.must_surface_fired','subjectType','job','subjectRef',p_job::text,'payload',jsonb_build_object('classifications',jsonb_build_object('action','operational'),'references',jsonb_build_object('decisionId',p_decision,'firingId',p_firing,'jobId',p_job,'rule',p_rule,'ruleVersion',p_version,'signalId',p_signal)))),'checked_operation');
 RETURN p_decision;
END $$;
CREATE OR REPLACE FUNCTION app.ch4_append_fact_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=NEW.tenant_id; seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor text; typ text; subject uuid;
 old_context text:=current_setting('app.tenant_id',true);
BEGIN
 PERFORM set_config('app.tenant_id',t::text,true);
 actor:=CASE WHEN NEW.actor_membership_id IS NULL THEN 'system:site-source' ELSE 'membership:'||NEW.actor_membership_id::text END;
 IF TG_TABLE_NAME='job_link' THEN typ:='job.work_state.linked'; subject:=NEW.predecessor_job_id; payload:=jsonb_build_object('references',jsonb_build_object('linkId',NEW.id,'successorJobId',NEW.successor_job_id),'hashes',jsonb_build_object('request',NEW.request_hash));
 ELSE typ:='job.work_state.'||NEW.kind; subject:=NEW.job_id; payload:=jsonb_build_object('references',jsonb_build_object('eventId',NEW.id,'jobId',NEW.job_id),'hashes',jsonb_build_object('request',NEW.request_hash)); END IF;
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',NEW.audit_event_id,'version','audit.v1','actorRef',actor,'eventType',typ,'subjectType','job','subjectRef',subject::text,'payload',payload)),'checked_operation');
 IF TG_TABLE_NAME='job_work_state_event' THEN IF NEW.source_receipt_id IS NOT NULL THEN PERFORM app.ch4_recheck_source_actor(t,NEW.job_id,NEW.source_receipt_id); END IF; END IF;
 PERFORM set_config('app.tenant_id',coalesce(old_context,''),true); RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.evaluate_recovery_follow_ups(p_tenant uuid, p_run uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE tick integer; f record; decision uuid; made integer:=0;
 audit_due record; clock_event record; audit_kind text; audit_id uuid; payload_text text; payload_digest text;
 head_sequence bigint; previous_digest text; occurred timestamptz; event_digest text; appended integer:=0;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_TENANT_INVALID' USING ERRCODE='42501'; END IF;
 -- Take the fence before enumerating intents or taking per-intent/audit locks.
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-follow-up-run:'||p_run::text));
 IF EXISTS (SELECT 1 FROM app.sandbox_run_event e WHERE e.tenant_id=p_tenant AND e.run_id=p_run AND e.kind='archived') THEN RETURN 0; END IF;
 tick:=app.recovery_follow_up_run_tick(p_tenant,p_run);
 FOR f IN SELECT id,job_id,case_id,due_tick FROM app.recovery_follow_up WHERE tenant_id=p_tenant AND run_id=p_run AND due_tick<=tick ORDER BY created_at,id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-follow-up:'||f.id::text));
  CONTINUE WHEN EXISTS (SELECT 1 FROM app.recovery_follow_up_due d WHERE d.tenant_id=p_tenant AND d.follow_up_id=f.id AND d.period=1);
  CONTINUE WHEN app.recovery_follow_up_stop_reason(p_tenant,f.id) IS NOT NULL;
  decision:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,p_tenant,'recovery_follow_up',f.id::text||':1','recovery.message.simulate');
  INSERT INTO app.recovery_follow_up_due(tenant_id,job_id,case_id,follow_up_id,period,decision_id,due_tick,clock_tick,environment)
   VALUES(p_tenant,f.job_id,f.case_id,f.id,1,decision,f.due_tick,tick,'synthetic_demo');
  INSERT INTO app.recovery_follow_up_event(id,tenant_id,job_id,case_id,follow_up_id,revision,kind,environment)
   VALUES(gen_random_uuid(),p_tenant,f.job_id,f.case_id,f.id,(SELECT coalesce(max(e.revision),0)+1 FROM app.recovery_follow_up_event e WHERE e.tenant_id=p_tenant AND e.follow_up_id=f.id),'became_due','synthetic_demo');
  made:=made+1;
 END LOOP;
 -- All domain mutations and per-intent locks above precede the audit batch. The application catch-up uses the same
 -- serialization key; take it before the audit head, then re-read missing entries under that lock. A second signal or
 -- observer finds the persisted audit_event_id already present. No business lock is acquired after the head.
 IF EXISTS (SELECT 1 FROM app.recovery_follow_up_due du JOIN app.recovery_follow_up fu ON fu.tenant_id=du.tenant_id AND fu.id=du.follow_up_id
   WHERE du.tenant_id=p_tenant AND fu.run_id=p_run
    AND NOT EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=du.tenant_id AND a.id=du.audit_event_id)) THEN
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-follow-up-audit'));

  FOR audit_due IN SELECT du.* FROM app.recovery_follow_up_due du JOIN app.recovery_follow_up fu ON fu.tenant_id=du.tenant_id AND fu.id=du.follow_up_id
    WHERE du.tenant_id=p_tenant AND fu.run_id=p_run
     AND NOT EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=du.tenant_id AND a.id=du.audit_event_id)
    ORDER BY du.created_at,du.follow_up_id LOOP
   SELECT e.command_id,e.payload_hash INTO clock_event FROM app.sandbox_run_event e
    WHERE e.tenant_id=p_tenant AND e.run_id=p_run AND e.kind='advanced' AND e.fake_clock_tick=audit_due.clock_tick
    ORDER BY e.event_index DESC LIMIT 1;
   -- Preserve time_advanced -> became_due history without deferring the due audit to another transaction.
   -- This is the persisted clock's fact, attributed to the system, not a claim of fresh human authorization.
   -- The later application command recognizes this command reference and does not append time_advanced again.
   FOREACH audit_kind IN ARRAY ARRAY['time_advanced','became_due'] LOOP
    IF audit_kind='time_advanced' THEN
     CONTINUE WHEN clock_event.command_id IS NULL OR EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=p_tenant
       AND a.subject_type='recovery_follow_up' AND a.subject_ref=audit_due.follow_up_id::text AND a.event_type='recovery.follow_up.time_advanced'
       AND a.payload->'references'->>'commandId'=clock_event.command_id::text);
     audit_id:=gen_random_uuid();
     payload_text:=format('{"classifications":{"action":"commercial"},"hashes":{"clock":"%s"},"references":{"caseId":"%s","commandId":"%s","jobId":"%s","runId":"%s"}}',
       clock_event.payload_hash,audit_due.case_id,clock_event.command_id,audit_due.job_id,p_run);
    ELSE
     audit_id:=audit_due.audit_event_id;
     payload_text:=format('{"classifications":{"action":"commercial"},"hashes":{},"references":{"caseId":"%s","decisionId":"%s","jobId":"%s"}}',
       audit_due.case_id,audit_due.decision_id,audit_due.job_id);
    END IF;
    PERFORM app.append_audit(jsonb_build_array(jsonb_build_object('id',audit_id,'version','audit.v1',
      'actorRef','system:recovery-follow-up-clock','eventType','recovery.follow_up.'||audit_kind,
      'subjectType','recovery_follow_up','subjectRef',audit_due.follow_up_id::text,'payload',payload_text::jsonb)));
    appended:=appended+1;
   END LOOP;
  END LOOP;
  -- A concurrent observer may have completed the legacy catch-up while this transaction waited for the audit lock.

 END IF;
 RETURN made;
END $$;

-- Identity bridge now accepts unsealed statements, never caller sequence/time/digests.
CREATE OR REPLACE FUNCTION identity.sso_audit_append(c uuid,e jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM identity.sso_load_connection(c);
 IF e->>'subjectRef' IS DISTINCT FROM c::text OR e->>'subjectType' IS DISTINCT FROM 'sso-connection'
  OR e->>'eventType' IS NULL OR (e->>'eventType') NOT LIKE 'sso.%' THEN
  RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 PERFORM app.lp4_seal_audit(jsonb_build_array(e),'lower_trust');
END $$;
COMMIT;
