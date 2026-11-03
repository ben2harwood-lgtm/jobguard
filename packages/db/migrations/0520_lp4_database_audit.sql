-- LP-4 part 1 RED: in-database audit append for every migrated database.
-- Full LP-4 authority guarantee REFUSED: reserved generic types and authority
-- consumers are NOT closed here. No production/real-data enablement.
-- Forward-only candidate: no history is rewritten.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_audit_writer') THEN
  RAISE EXCEPTION 'jobguard_audit_writer is missing; run administrative ensureRoles before migrations' USING ERRCODE='42704';
 END IF;
END $$;
GRANT USAGE ON SCHEMA app, audit_control TO jobguard_audit_writer;
GRANT CREATE ON SCHEMA app TO jobguard_audit_writer;
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
REVOKE CREATE ON SCHEMA app FROM jobguard_audit_writer;
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
CREATE OR REPLACE FUNCTION app.ch4_append_fact_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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

-- Catch-up: preserve latest main behaviour; replace only audit serialization.
-- Latest main definition: packages/db/migrations/0193_later_decision_identity.sql (app.decision_check_command).
CREATE OR REPLACE FUNCTION app.decision_check_command(p_digest text,p_command jsonb,p_phase text,p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid; j uuid; c uuid; actor uuid; owned boolean; prior app.command_receipt;
 request_digest text; revision_number integer; item jsonb; did uuid; fid uuid; added integer:=0; repeated integer:=0;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor_ref text;
BEGIN
 -- Authority is established before job existence, phase handling or replay.
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF t IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=p_digest AND s.environment='synthetic_demo'
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(p_digest,t) a;
 IF actor IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR jsonb_typeof(p_command)<>'object' OR p_command->>'version' IS DISTINCT FROM 'finding-evaluation-command.v1'
   OR p_command - ARRAY['version','commandId','tenantId','jobId'] <> '{}'::jsonb
   OR (p_command->>'tenantId')::uuid IS DISTINCT FROM t OR p_command->>'commandId' IS NULL OR p_command->>'jobId' IS NULL
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 j:=(p_command->>'jobId')::uuid; c:=(p_command->>'commandId')::uuid;
 WITH RECURSIVE owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=p_digest
   UNION
   SELECT next_job.id FROM owned_job source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job'
     AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job next_job ON next_job.tenant_id=e.tenant_id AND next_job.id::text=e.subject_ref
     AND next_job.provenance='imported' AND next_job.practice_session_digest IS NULL
 ) SELECT EXISTS(SELECT 1 FROM owned_job WHERE id=j) INTO owned;
 IF NOT owned THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 -- Same lock order on all phases: authority -> job -> command -> receipt -> finding -> audit.
 -- This synthetic builder endpoint does not accept contractor principals or tenants.
 SELECT revision INTO revision_number FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('decision-check:'||t::text||':'||c::text,0));
 request_digest:=app.final_lock_hash(p_command);
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=c FOR UPDATE;
 IF FOUND AND (prior.command_type<>'finding.evaluate' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='begin' THEN
   IF prior.command_id IS NOT NULL THEN
     IF prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
     RETURN jsonb_build_object('replay',true,'response',prior.result);
   END IF;
   INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
     VALUES(c,t,'finding.evaluate','finding-evaluate:'||j::text||':'||c::text,request_digest,'processing',actor);
   RETURN jsonb_build_object('replay',false);
 END IF;
 IF prior.command_id IS NULL OR prior.status<>'processing' OR prior.created_at<>transaction_timestamp()
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='persist' THEN
   IF p_data IS NULL OR jsonb_typeof(p_data->'findings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_data->'suppressed') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'findings')>100
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_data->'findings') LOOP
     IF item->>'version' IS DISTINCT FROM 'finding.v1' OR (item->>'jobId')::uuid IS DISTINCT FROM j
       OR item - ARRAY['version','fingerprint','kind','classification','title','detail','jobId','subjectRef','actionType','suggestionConfidence'] <> '{}'::jsonb
       OR item->>'fingerprint' IS NULL OR item->>'fingerprint' !~ '^[a-f0-9]{64}$'
       OR (item->>'kind'='required_proof' AND item->>'classification' IS DISTINCT FROM 'mandatory')
     THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
     SELECT decision_id,id INTO did,fid FROM app.job_finding WHERE tenant_id=t AND fingerprint=item->>'fingerprint';
     IF FOUND THEN
       IF NOT EXISTS (SELECT 1 FROM app.job_finding f WHERE f.tenant_id=t AND f.id=fid AND f.job_id=j
         AND (f.kind,f.classification,f.title,f.detail,f.subject_ref,f.action_type)=
           (item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType'))
       THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
       repeated:=repeated+1;
     ELSE
       did:=gen_random_uuid(); fid:=gen_random_uuid();
       INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
         VALUES(did,t,'finding',item->>'subjectRef',item->>'actionType');
       INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision)
         VALUES(fid,t,j,did,item->>'fingerprint',item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType',(item->>'suggestionConfidence')::numeric,revision_number);
       added:=added+1;
     END IF;
     IF (p_data->'suppressed') ? (item->>'fingerprint') THEN
       INSERT INTO app.finding_suppression(id,tenant_id,finding_id,reason,policy_version)
         VALUES(gen_random_uuid(),t,fid,'daily_advisory_budget','decision-suppression.v1') ON CONFLICT(tenant_id,finding_id) DO NOTHING;
     END IF;
   END LOOP;
   RETURN jsonb_build_object('created',added,'replayed',repeated);
 ELSIF p_phase='finish' THEN
   IF p_data->'response' IS NULL OR p_data->'response'->>'version' IS DISTINCT FROM 'decision-inbox.v1'
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   UPDATE app.command_receipt SET status='succeeded',result=p_data->'response',completed_at=clock_timestamp()
     WHERE tenant_id=t AND command_id=c;
   -- Audit allocation is the final new lock. All command/domain writes precede it.

     actor_ref:='membership:'||actor::text;
   payload:=jsonb_build_object('references',jsonb_build_object('commandId',c,'jobId',j));

   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef',actor_ref,'eventType','finding.checked','subjectType','job','subjectRef',j::text,'payload',payload)),'checked_operation');

   RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
END $$;

-- Latest main definition: packages/db/migrations/0195_subscription_persistence.sql (app.mon2_audit).
CREATE OR REPLACE FUNCTION app.mon2_audit(t uuid,actor uuid,command uuid,kind text,hash text,result_hash text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN


 payload:=jsonb_build_object('references',jsonb_build_object('commandId',command::text),'hashes',jsonb_build_object('request',hash,'result',result_hash));

 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||actor::text,'eventType','subscription.'||kind,'subjectType','subscription','subjectRef',t::text,'payload',payload)),'checked_operation');

END $$;

-- Latest main definition: packages/db/migrations/0208_meter_small_trip.sql (app.mon1_capture_small_trip).
CREATE OR REPLACE FUNCTION app.mon1_capture_small_trip(t uuid,j uuid,source_kind text,source_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE terms app.job_activation_terms; trip app.job_small_trip_event; previous app.job_small_trip_observation;
 fact record; latest jsonb:='{}'; selected_sources jsonb:='{}'; source_set jsonb; total numeric; cutoff timestamptz;
 crossing_at timestamptz; crossing_net numeric; crossing_source uuid; crossing_revision uuid; crossing_set jsonb;
 source_digest text; observation uuid; event_id uuid; observation_revision integer;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 -- The caller is a checked source command, never a browser or runtime SQL call.
 -- It MUST already hold tenant lock 184 before any job/variation/source lock.
 -- Refuse a missing lock; never acquire a tenant lock here after business locks.
 IF current_user<>'jobguard_migration' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'SMALL_TRIP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND mode='ExclusiveLock' AND granted AND objsubid=1
  AND classid::bigint=(hashtextextended(t::text,184)>>32)::bit(32)::bigint
  AND objid::bigint=hashtextextended(t::text,184)::bit(32)::bigint)
 THEN RAISE EXCEPTION 'SMALL_TRIP_LOCK_ORDER_REQUIRED' USING ERRCODE='55000'; END IF;
 IF source_kind IS NULL OR source_kind NOT IN('activation','variation_approval') OR source_id IS NULL
 THEN RAISE EXCEPTION 'INVALID_SMALL_TRIP_SOURCE' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM app.job job JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(job.tenant_id,job.id)
  WHERE job.tenant_id=t AND job.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo' FOR UPDATE OF job;
 IF NOT FOUND THEN RAISE EXCEPTION 'SMALL_TRIP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO terms FROM app.job_activation_terms WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'SMALL_TRIP_BASELINE_REQUIRED' USING ERRCODE='55000'; END IF;
 SELECT locked_at INTO cutoff FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF source_kind='activation' THEN
  IF source_id IS DISTINCT FROM terms.activation_id THEN RAISE EXCEPTION 'INVALID_SMALL_TRIP_SOURCE' USING ERRCODE='22023'; END IF;
 ELSE
  -- The immutable revision, not a mutable draft or a caller-supplied amount.
  IF NOT EXISTS(SELECT 1 FROM app.variation_approval a
   JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.variation_id,r.id)=(a.tenant_id,a.job_id,a.variation_id,a.revision_id)
   JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(a.tenant_id,a.job_id,a.variation_id)
   WHERE a.tenant_id=t AND a.job_id=j AND a.id=source_id AND v.origin IN('builder_logged','final_review')
    AND a.revision=r.revision AND a.content_hash=r.content_hash AND a.signed_delta_pence=r.signed_delta_pence
    AND a.created_at>=terms.activated_at AND (cutoff IS NULL OR a.created_at<cutoff))
  THEN RAISE EXCEPTION 'INVALID_SMALL_TRIP_SOURCE' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO trip FROM app.job_small_trip_event WHERE tenant_id=t AND job_id=j;
 -- Only an originally small job can lose its allowance. Never regain it.
 IF NOT terms.small_job THEN RETURN trip.id; END IF;
 total:=terms.accepted_net_pence;
 FOR fact IN SELECT a.id,a.variation_id,a.revision_id,r.revision,r.signed_delta_pence,a.created_at
  FROM app.variation_approval a
  JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.variation_id,r.id)=(a.tenant_id,a.job_id,a.variation_id,a.revision_id)
  JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(a.tenant_id,a.job_id,a.variation_id)
  WHERE a.tenant_id=t AND a.job_id=j AND v.origin IN('builder_logged','final_review')
   AND a.revision=r.revision AND a.content_hash=r.content_hash AND a.signed_delta_pence=r.signed_delta_pence
   AND a.created_at>=terms.activated_at AND (cutoff IS NULL OR a.created_at<cutoff)
  ORDER BY a.created_at,a.id
 LOOP
  IF coalesce((latest->fact.variation_id::text->>'revision')::integer,0)>=fact.revision THEN CONTINUE; END IF;
  total:=total-coalesce((latest->fact.variation_id::text->>'net')::numeric,0)+fact.signed_delta_pence;
  latest:=jsonb_set(latest,ARRAY[fact.variation_id::text],jsonb_build_object('revision',fact.revision,'net',fact.signed_delta_pence));
  selected_sources:=jsonb_set(selected_sources,ARRAY[fact.variation_id::text],to_jsonb(fact.id::text));
  IF abs(total)>1000000000000 THEN RAISE EXCEPTION 'SMALL_TRIP_TOTAL_OUT_OF_RANGE' USING ERRCODE='22003'; END IF;
  IF total>400000 THEN
   crossing_at:=fact.created_at; crossing_net:=total; crossing_source:=fact.id; crossing_revision:=fact.revision_id;
   SELECT coalesce(jsonb_agg(value ORDER BY key),'[]') INTO crossing_set FROM jsonb_each(selected_sources);
   EXIT;
  END IF;
 END LOOP;
 IF crossing_at IS NULL THEN
  IF trip.id IS NOT NULL THEN RAISE EXCEPTION 'SMALL_TRIP_RECONCILIATION_REQUIRED' USING ERRCODE='55000'; END IF;
  RETURN NULL;
 END IF;
 source_set:=crossing_set;
 -- Original source times use six digits; hashes never depend on connection timezone.
 source_digest:=app.final_lock_hash(jsonb_build_object('version','meter-small-trip.v1','tenant',t,'job',j,
  'activation',terms.activation_id,'baseline',terms.baseline_quote_version_id,'baselineHash',terms.baseline_document_hash,
  'baselineNet',terms.accepted_net_pence,'at',to_char(crossing_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'source',crossing_source,'revision',crossing_revision,'sources',source_set,'net',crossing_net));
 IF trip.id IS NULL THEN
  INSERT INTO app.job_small_trip_event(tenant_id,job_id,id,activation_id,baseline_quote_version_id,source_kind,source_id,effective_at,net_pence,source_hash,policy_version)
  VALUES(t,j,gen_random_uuid(),terms.activation_id,terms.baseline_quote_version_id,'variation_approval',crossing_source,crossing_at,crossing_net::bigint,source_digest,'meter-small-trip.v1') RETURNING * INTO trip;
 END IF;
 SELECT * INTO previous FROM app.job_small_trip_observation WHERE tenant_id=t AND trip_id=trip.id ORDER BY revision DESC LIMIT 1;
 IF previous.id IS NOT NULL THEN
  IF previous.source_hash=source_digest THEN RETURN trip.id; END IF;
  -- A late source must never retract or postpone an already latched crossing.
  IF crossing_at>previous.effective_at THEN RAISE EXCEPTION 'SMALL_TRIP_RECONCILIATION_REQUIRED' USING ERRCODE='55000'; END IF;
 END IF;
 observation:=gen_random_uuid(); event_id:=gen_random_uuid(); observation_revision:=coalesce(previous.revision,0)+1;
 INSERT INTO app.job_small_trip_observation(tenant_id,job_id,id,trip_id,revision,previous_observation_id,source_kind,source_id,approval_id,revision_id,activation_id,effective_at,net_pence,source_set,source_hash,policy_version,audit_event_id)
 VALUES(t,j,observation,trip.id,observation_revision,previous.id,'variation_approval',crossing_source,crossing_source,crossing_revision,terms.activation_id,crossing_at,crossing_net::bigint,source_set,source_digest,'meter-small-trip.v1',event_id);
 -- Audit is last. The source owner must finish all business mutations/locks before
 -- calling this seam, and append its own source audit afterwards in this transaction.


 payload:=jsonb_build_object('references',jsonb_build_object('jobId',j,'tripId',trip.id,'observationId',observation,'sourceId',crossing_source),'hashes',jsonb_build_object('source',source_digest));


 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',event_id,'version','audit.v1','actorRef','system:meter-small-trip','eventType','meter.small_trip_observed','subjectType','job','subjectRef',j::text,'payload',payload)),'checked_operation');

 RETURN trip.id;
END $$;

-- Latest main definition: packages/db/migrations/0237_final_check_prerequisites.sql (app.guard_final_check_manifest).
CREATE OR REPLACE FUNCTION app.guard_final_check_manifest() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE inventory jsonb;l app.final_account_lock;excluded jsonb;seq bigint;prev text;ts timestamptz;payload jsonb;ph text;eh text;
BEGIN
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 IF NEW.lock_id IS NULL AND NEW.evidence_cutoff_at IS NULL THEN SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id; NEW.lock_id:=l.id;NEW.evidence_cutoff_at:=l.locked_at; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id,id,locked_at)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at)) THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID' USING ERRCODE='23503'; END IF;
 INSERT INTO app.final_check_manifest_source(tenant_id,job_id,manifest_id,id,upload_id,source_kind,evidence_id,object_version_id,sha256,source_received_at,evidence_received_at,frozen_input_hash,adapter_version,excluded_state,excluded_reason)
 SELECT u.tenant_id,u.job_id,NEW.id,u.id,u.id,'evidence_upload',e.id,e.object_version_id,e.sha256,u.server_received_at,e.server_received_at,
 app.final_lock_hash(jsonb_build_object('upload',u.id,'receivedAt',to_char(u.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expectedHash',u.expected_sha256,'contentType',u.expected_content_type)),NEW.detector_version,
 CASE WHEN u.state='rejected' THEN u.state WHEN u.state='pending' AND u.expires_at<=clock_timestamp() THEN 'expired' END,
 CASE WHEN u.state='rejected' THEN coalesce(u.rejection_code,'rejected') WHEN u.state='pending' AND u.expires_at<=clock_timestamp() THEN 'expired_unswept' END
 FROM app.evidence_upload u LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id,e.kind)=(u.tenant_id,u.job_id,u.id,'original')
 WHERE u.tenant_id=NEW.tenant_id AND u.job_id=NEW.job_id AND u.server_received_at<=NEW.evidence_cutoff_at;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'inputHash',frozen_input_hash) ORDER BY id),'[]'),count(*) INTO inventory,NEW.source_count FROM app.final_check_manifest_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND manifest_id=NEW.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',upload_id,'state',excluded_state,'reason',excluded_reason) ORDER BY upload_id),'[]') INTO excluded FROM app.final_check_manifest_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND manifest_id=NEW.id AND excluded_state IS NOT NULL;
 IF jsonb_array_length(excluded)>0 THEN
  -- Audited once per manifest, with the exact exclusions; the audit head is allocated last, after every business lock above.

  payload:=jsonb_build_object('references',jsonb_build_object('manifestId',NEW.id,'lockId',NEW.lock_id),'hashes',jsonb_build_object('exclusions',app.final_lock_hash(excluded)));

  PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','system:final_check','eventType','final_check.sources_excluded','subjectType','job','subjectRef',NEW.job_id::text,'payload',payload)),'checked_operation');

 END IF;
 NEW.inventory_hash:=app.final_lock_hash(inventory);NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;

-- Latest main definition: packages/db/migrations/0237_final_check_prerequisites.sql (app.publish_final_check_certificate).
CREATE OR REPLACE FUNCTION app.publish_final_check_certificate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result_digest text;b app.shadow_final_check_run_binding;prior app.final_account_lock_check;seq bigint;prev text;ts timestamptz;payload jsonb;ph text;eh text;event_id uuid:=gen_random_uuid();
BEGIN
 -- Verify actual role/context, then qualified FK identity before job-specific completeness.
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.lock_id IS NULL AND NEW.evidence_cutoff_at IS NULL THEN SELECT id,locked_at INTO NEW.lock_id,NEW.evidence_cutoff_at FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id,id,locked_at)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at)) THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID' USING ERRCODE='23503'; END IF;
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 SELECT * INTO prior FROM app.final_account_lock_check WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF FOUND THEN
  IF ROW(prior.job_id,prior.lock_id,prior.evidence_cutoff_at,prior.run_id,prior.status) IS DISTINCT FROM ROW(NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at,NEW.run_id,NEW.status) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN NULL;
 END IF;
 IF NEW.status<>'completed' THEN RETURN NEW; END IF;
 IF NEW.run_id IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 result_digest:=app.verify_final_check_run(NEW.tenant_id,NEW.job_id,NEW.run_id,NEW.lock_id,NEW.evidence_cutoff_at);
 SELECT * INTO b FROM app.shadow_final_check_run_binding WHERE (tenant_id,job_id,run_id)=(NEW.tenant_id,NEW.job_id,NEW.run_id);
 INSERT INTO app.shadow_final_check_completion(tenant_id,job_id,check_id,run_id,manifest_id,lock_id,evidence_cutoff_at,result_hash) VALUES(NEW.tenant_id,NEW.job_id,NEW.id,NEW.run_id,b.manifest_id,NEW.lock_id,NEW.evidence_cutoff_at,result_digest);
 -- All business locks are already held before allocating this append-only audit head.

 -- Public completion is generic; the verified result digest remains in the private certificate.
 payload:=jsonb_build_object('references',jsonb_build_object('checkId',NEW.id,'runId',NEW.run_id,'lockId',NEW.lock_id));

 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',event_id,'version','audit.v1','actorRef','system:final_check','eventType','final_check.completed','subjectType','job','subjectRef',NEW.job_id::text,'payload',payload)),'checked_operation');
 RETURN NEW;
END $$;

-- Latest main definition: packages/db/migrations/0238_final_check.sql (app.append_final_check_audit).
CREATE OR REPLACE FUNCTION app.append_final_check_audit(e uuid,actor text,j uuid,k text,refs jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;seq bigint;prev text;ts timestamptz;payload jsonb;ph text;eh text;
BEGIN

 payload:=jsonb_build_object('references',jsonb_strip_nulls(refs),'hashes','{}'::jsonb);

 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',e,'version','audit.v1','actorRef',actor,'eventType',k,'subjectType','job','subjectRef',j::text,'payload',payload)),'checked_operation');
END $$;

-- Latest main definition: packages/db/migrations/0243_contractor_billing.sql (app.cb_complete).
CREATE OR REPLACE FUNCTION app.cb_complete(p_session uuid,p_job uuid,p_command uuid,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; r app.command_receipt; seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb; typ text;
BEGIN
 a:=app.cb_authority(p_session,p_job,true);
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command AND actor_membership_id=a AND semantic_key='contractor-billing:'||p_job::text||':'||p_command::text AND status='processing';
 IF r.command_type NOT IN('FinaliseExportBatch','ImportBillingStatus','ApproveBillingDelivery') OR r.command_id IS NULL THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 UPDATE app.command_receipt SET status='succeeded',result=p_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command;
 typ:='contractor.billing.'||lower(r.command_type);
 payload:=jsonb_build_object('references',jsonb_build_object('command',p_command::text,'job',p_job::text,'environment','synthetic_demo'),'hashes',jsonb_strip_nulls(jsonb_build_object('request',r.request_hash,'result',app.final_lock_hash(p_result),
  'artifact',(SELECT json_hash FROM app.billing_export_batch WHERE tenant_id=t AND command_id=p_command),
  'csv',(SELECT csv_hash FROM app.billing_export_batch WHERE tenant_id=t AND command_id=p_command),
  'derivation',(SELECT app.final_lock_hash(jsonb_agg(jsonb_build_object('id',id,'input',input_hash,'projection',app.final_lock_hash(projection)) ORDER BY source,invoice_number)) FROM app.billing_allocation_run WHERE tenant_id=t AND command_id=p_command))));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,'eventType',typ,'subjectType','job','subjectRef',p_job::text,'payload',payload)),'checked_operation');

 RETURN p_result;
END $$;

-- Latest main definition: packages/db/migrations/0243_contractor_billing.sql (app.cb_audit).
CREATE OR REPLACE FUNCTION app.cb_audit(p_actor uuid,p_job uuid,p_type text,p_outbox uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid:=p_actor; seq bigint; prev text; ts timestamptz; ph text; eh text; typ text:=p_type;
 payload jsonb;
BEGIN
 payload:=jsonb_build_object('references',jsonb_build_object('job',p_job::text,'outbox',p_outbox::text,'environment','synthetic_demo'),
 'hashes',jsonb_build_object('outcome',app.final_lock_hash(jsonb_build_object('status',(SELECT status FROM app.action_outbox WHERE tenant_id=t AND id=p_outbox),
 'attempts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.attempt_number) FROM app.action_attempt x WHERE x.tenant_id=t AND x.action_id=p_outbox)))));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,'eventType',typ,'subjectType','job','subjectRef',p_job::text,'payload',payload)),'checked_operation');

END $$;

-- Latest main definition: packages/db/migrations/0276_enterprise_fee_derivation.sql (app.ef_derive).
CREATE OR REPLACE FUNCTION app.ef_derive(p_session uuid,p_command uuid,p_agreement uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; ag app.enterprise_agreement_version; existing app.enterprise_fee_derivation;
 cutoff timestamptz; req text; qrows jsonb; fx jsonb; ih text; acc numeric[]:=ARRAY[0::numeric,1::numeric];
 c record; d uuid:=gen_random_uuid(); fee bigint; seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; a:=app.ef_actor(p_session);
 IF p_command IS NULL OR p_agreement IS NULL OR p_period IS NULL OR p_period !~ '^[2-9][0-9]{3}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,618));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_agreement::text||':'||p_period,746));
 SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=p_agreement FOR SHARE;
 IF ag.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
 IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;

 req:=app.final_lock_hash(jsonb_build_object('command','DeriveEnterpriseFee','agreement',p_agreement,'period',p_period));
 SELECT * INTO existing FROM app.enterprise_fee_derivation WHERE tenant_id=t AND command_id=p_command;
 IF existing.id IS NOT NULL THEN
  IF existing.request_hash<>req THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('derivationId',existing.id,'replayed',true);
 END IF;

 fx:=app.ef_inputs(t,ag,p_period); qrows:=fx->'rows'; ih:=fx->>'hash'; cutoff:=(fx->>'cutoff')::timestamptz;
 SELECT * INTO existing FROM app.enterprise_fee_derivation WHERE tenant_id=t AND agreement_version_id=p_agreement AND period=p_period AND input_hash=ih;
 IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('derivationId',existing.id,'replayed',true); END IF;

 FOR c IN SELECT (x->>'n')::numeric n,(x->>'dd')::numeric dd FROM jsonb_array_elements(qrows) x LOOP acc:=app.cb_add(acc[1],acc[2],c.n,c.dd); END LOOP;
 IF acc[1]<0 THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 fee:=app.ef_round_half_even(acc[1]*ag.rate_numerator,acc[2]*ag.rate_denominator);

 INSERT INTO app.enterprise_fee_derivation(tenant_id,id,command_id,agreement_version_id,period,recorded_cutoff,qualifying_numerator,qualifying_denominator,cumulative_fee_pence,input_hash,request_hash,actor_membership_id)
 VALUES(t,d,p_command,p_agreement,p_period,cutoff,acc[1],acc[2],fee,ih,req,a);
 INSERT INTO app.enterprise_fee_contribution(tenant_id,id,derivation_id,job_id,extra_id,origin_kind,export_line_id,allocation_id,run_id,rule,qualifying_numerator,qualifying_denominator)
 SELECT t,gen_random_uuid(),d,x.job_id,x.extra_id,x.origin_kind,x.export_line_id,x.allocation_id,x.run_id,x.rule,x.n,x.dd
 FROM jsonb_to_recordset(qrows) AS x(job_id uuid,extra_id uuid,origin_kind text,export_line_id uuid,allocation_id uuid,run_id uuid,rule text,n numeric,dd numeric);

 -- Audit in the same transaction; no business lock is taken after the audit head.
 payload:=jsonb_build_object('references',jsonb_build_object('derivation',d::text,'agreement',p_agreement::text,'period',p_period,'environment','synthetic_demo'),
  'hashes',jsonb_build_object('input',ih,'request',req));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,'eventType','enterprise_fee.derived','subjectType','enterprise_fee_derivation','subjectRef',d::text,'payload',payload)),'checked_operation');

 RETURN jsonb_build_object('derivationId',d,'replayed',false);
END $$;

-- Latest main definition: packages/db/migrations/0322_enterprise_duplicate_reconciliation.sql (app.ef_audit).
CREATE OR REPLACE FUNCTION app.ef_audit(a uuid,p_type text,p_subject_type text,p_subject uuid,payload jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; seq bigint; prev text; ts timestamptz; ph text; eh text;
BEGIN
 payload:=jsonb_set(payload,'{references}',(SELECT jsonb_object_agg(key,
  CASE WHEN jsonb_typeof(value)='number' THEN to_jsonb(value::text) ELSE value END) FROM jsonb_each(payload->'references')));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,'eventType',p_type,'subjectType',p_subject_type,'subjectRef',p_subject::text,'payload',payload)),'checked_operation');

END $$;

-- Latest main definition: packages/db/migrations/0296_enterprise_baseline.sql (app.enterprise_baseline_import).
CREATE OR REPLACE FUNCTION app.enterprise_baseline_import(p_session uuid,p_history text,p_hash text,p_bindings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb:=p_history::jsonb;
 b app.enterprise_baseline_batch; item jsonb; batch uuid:=gen_random_uuid();
 seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb;
BEGIN
 a:=app.enterprise_baseline_actor(p_session);
 -- Reuse the existing tenant data.import permission (finance); importing history grants no read scope.
 IF NOT coalesce(app.contractor_allowed(a,'data.import',t),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF h->>'version' IS DISTINCT FROM 'baseline-history.v1' OR h->>'environment' IS DISTINCT FROM 'synthetic_demo'
  OR p_hash IS DISTINCT FROM encode(sha256(convert_to(p_history,'UTF8')),'hex')
  OR jsonb_typeof(h->'teamIds') IS DISTINCT FROM 'array' OR jsonb_typeof(h->'jobs') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_bindings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_bindings) NOT BETWEEN 1 AND 1000
  OR jsonb_array_length(p_bindings)<>jsonb_array_length(h->'teamIds')
  OR jsonb_array_length(h->'jobs')>10000
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(h->'teamIds') x)<>jsonb_array_length(h->'teamIds')
  OR (SELECT count(DISTINCT x->>'sourceTeamId') FROM jsonb_array_elements(p_bindings) x)<>jsonb_array_length(p_bindings)
  OR (SELECT count(DISTINCT x->>'teamId') FROM jsonb_array_elements(p_bindings) x)<>jsonb_array_length(p_bindings)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_bindings) x WHERE NOT(h->'teamIds' ? (x->>'sourceTeamId'))
    OR NOT EXISTS(SELECT 1 FROM app.team z WHERE z.tenant_id=t AND z.id=(x->>'teamId')::uuid))
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 -- Defense in depth for the stored observation window; the server's versioned parser validates all job/extra fields.
 IF coalesce(h->>'startMonth','') !~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
  OR coalesce(h->>'endMonthExclusive','') !~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 IF ((left(h->>'endMonthExclusive',4)::int-left(h->>'startMonth',4)::int)*12
  +right(h->>'endMonthExclusive',2)::int-right(h->>'startMonth',2)::int) NOT BETWEEN 6 AND 12
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 -- Serialize source identity before uniqueness/replay inspection; organization fence precedes source, audit last.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||(h->>'sourceNamespace')||':'||(h->>'sourceBatchId'),9275));
 SELECT * INTO b FROM app.enterprise_baseline_batch WHERE tenant_id=t AND source_namespace=h->>'sourceNamespace' AND source_batch_id=h->>'sourceBatchId';
 IF FOUND THEN
  IF b.source_hash<>p_hash OR b.history<>h OR
   (SELECT jsonb_agg(jsonb_build_object('sourceTeamId',source_team_id,'teamId',team_id) ORDER BY source_team_id COLLATE "C") FROM app.enterprise_baseline_team WHERE tenant_id=t AND batch_id=b.id) IS DISTINCT FROM p_bindings
  THEN RAISE EXCEPTION 'BASELINE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('batchId',b.id,'sourceHash',b.source_hash,'replayed',true);
 END IF;
 INSERT INTO app.enterprise_baseline_batch(tenant_id,id,source_namespace,source_batch_id,source_hash,history,canonical_history,actor_membership_id)
 VALUES(t,batch,h->>'sourceNamespace',h->>'sourceBatchId',p_hash,h,p_history,a);
 FOR item IN SELECT value FROM jsonb_array_elements(p_bindings) LOOP
  INSERT INTO app.enterprise_baseline_team VALUES(t,batch,item->>'sourceTeamId',(item->>'teamId')::uuid);
 END LOOP;
 payload:=jsonb_build_object('references',jsonb_build_object('batch',batch::text,'environment','synthetic_demo'),'hashes',jsonb_build_object('source',p_hash));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,'eventType','enterprise.baseline.imported','subjectType','baseline','subjectRef',batch::text,'payload',payload)),'checked_operation');

 RETURN jsonb_build_object('batchId',batch,'sourceHash',p_hash,'replayed',false);
END $$;

-- Latest main definition: packages/db/migrations/0313_small_builder_demo_runs.sql (app.small_builder_demo_audit).
CREATE OR REPLACE FUNCTION app.small_builder_demo_audit(t uuid,actor uuid,command uuid,kind text,hash text,result_hash text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN


 payload:=jsonb_build_object('references',jsonb_build_object('commandId',command::text),'hashes',jsonb_build_object('request',hash,'result',result_hash));

 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||actor::text,'eventType','small_builder_demo.'||kind,'subjectType','small_builder_demo','subjectRef',t::text,'payload',payload)),'checked_operation');

END $$;

-- Latest main definition: packages/db/migrations/0322_enterprise_duplicate_reconciliation.sql (app.ef_reconcile_exported_duplicate).
CREATE OR REPLACE FUNCTION app.ef_reconcile_exported_duplicate(p_session uuid,p_command uuid,p_job uuid,p_duplicate uuid,p_canonical uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; req text; prior app.command_receipt; correction uuid:=gen_random_uuid(); link uuid:=gen_random_uuid();
 dec uuid:=gen_random_uuid(); res uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid(); fixes jsonb; content jsonb; h text;
 seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb; outcome jsonb;
BEGIN
 a:=app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF p_command IS NULL OR p_job IS NULL OR p_duplicate IS NULL OR p_canonical IS NULL OR p_duplicate=p_canonical THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 -- Organisation fence -> tenant billing lock -> job/group -> extras by ID -> actor -> audit last.
 -- Q-02 (17 October): authority is checked even for replay; non-live jobs always refuse.
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND ct.job_track='contractor' AND ct.environment='synthetic_demo') THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.cb_authority(p_session,p_job,true);
 a:=app.ef_actor(p_session);
 req:=app.final_lock_hash(jsonb_build_object('command','ReconcileExportedDuplicate','job',p_job,'duplicate',p_duplicate,'canonical',p_canonical,'actor',a));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF prior.command_id IS NOT NULL THEN
  IF prior.command_type<>'ReconcileExportedDuplicate' OR prior.request_hash<>req OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT jsonb_build_object('correctionId',c.id,'linkId',c.link_id,'contentHash',c.content_hash,'corrections',c.corrections,'replayed',true) INTO outcome
   FROM app.enterprise_duplicate_correction c WHERE c.tenant_id=t AND c.command_id=p_command AND c.actor_membership_id=a;
  IF outcome IS NULL THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN outcome;
 END IF;
 IF (SELECT count(*) FROM app.billing_export_line WHERE tenant_id=t AND job_id=p_job AND extra_id IN(p_duplicate,p_canonical))<>2 THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_duplicate_link l WHERE l.tenant_id=t AND l.job_id=p_job AND l.kind='link'
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(t,l.id))
  AND (l.duplicate_id IN(p_duplicate,p_canonical) OR l.canonical_id=p_duplicate)) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 -- Compute the uncredited duplicate invoice balance from current stored, validated projections.
 -- Net pence stays a reduced exact fraction: cb_add cross-multiplies and uses integer div only for GCD reduction.
 -- No per-correction rounding; half-even remains at the cumulative fee. Gross and its authorization are unchanged.
 SELECT coalesce(jsonb_agg(jsonb_build_object('runId',r.id,'exportLineId',e.id,'source',r.source,'invoiceNumber',r.invoice_number,
  'externalInvoiceLineId',m.external_invoice_line_id,'kind','credit_instruction',
  'netPence',jsonb_build_object('numerator',greatest(0,balance.net[1])::text,'denominator',CASE WHEN balance.net[1]<=0 THEN '1' ELSE balance.net[2]::text END),
  'grossPence',greatest(0,(il->>'grossPence')::numeric-coalesce((SELECT sum((z->>'grossPence')::numeric) FROM app.billing_fact cf CROSS JOIN LATERAL jsonb_array_elements(cf.payload->'lineAdjustments') z
    WHERE cf.tenant_id=t AND cf.source=r.source AND cf.invoice_number=r.invoice_number AND cf.match_valid AND cf.payload->>'factType'='credited' AND z->>'externalInvoiceLineId'=m.external_invoice_line_id),0))) ORDER BY r.id,m.external_invoice_line_id),'[]'::jsonb)
 INTO fixes FROM app.billing_export_line e JOIN app.billing_line_match m ON(m.tenant_id,m.export_line_id)=(e.tenant_id,e.id)
 JOIN app.billing_fact f ON(f.tenant_id,f.id)=(m.tenant_id,m.fact_id)
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.source,r.invoice_number)=(f.tenant_id,f.job_id,f.source,f.invoice_number)
 CROSS JOIN LATERAL jsonb_array_elements(r.projection->'lines') x
 CROSS JOIN LATERAL (SELECT app.cb_add((x->'billedNet'->>'numerator')::numeric,(x->'billedNet'->>'denominator')::numeric,
  -(x->'creditedNet'->>'numerator')::numeric,(x->'creditedNet'->>'denominator')::numeric) net) balance
 CROSS JOIN LATERAL jsonb_array_elements(f.payload->'composition'->'lines') il
 WHERE e.tenant_id=t AND e.job_id=p_job AND e.extra_id=p_duplicate AND x->>'lineId'=m.external_invoice_line_id AND il->>'externalInvoiceLineId'=m.external_invoice_line_id
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run nx WHERE nx.tenant_id=t AND nx.predecessor_id=r.id);
 content:=jsonb_build_object('version','enterprise-duplicate-correction.v1','jobId',p_job,'duplicateId',p_duplicate,'canonicalId',p_canonical,'corrections',fixes);
 h:=app.final_lock_hash(content);
 -- The explicit finance command approves exactly this server-derived correction, atomically (AGENTS 5.3).
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,p_command,'ReconcileExportedDuplicate','enterprise-duplicate:'||p_job::text||':'||p_command::text,req,'processing',a);
 INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES(t,dec,'enterprise_duplicate_correction',correction::text,'ReconcileExportedDuplicate');
 INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES(t,res,dec,'approved',a);
 INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(t,auth,dec,res,a,'ReconcileExportedDuplicate',NULL,h,1,(SELECT coalesce(sum((x->>'grossPence')::bigint),0) FROM jsonb_array_elements(fixes) x),'GBP','enterprise_site_capture_policy_v1',clock_timestamp()+interval '1 day');
 INSERT INTO app.enterprise_duplicate_correction(tenant_id,id,command_id,link_id,job_id,duplicate_id,canonical_id,actor_membership_id,authorization_id,corrections,content_hash)
 VALUES(t,correction,p_command,link,p_job,p_duplicate,p_canonical,a,auth,fixes,h);
 INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,command_id,actor_membership_id)
 VALUES(t,link,p_job,p_duplicate,p_canonical,'link',p_command,a);
 outcome:=jsonb_build_object('correctionId',correction,'linkId',link,'contentHash',h,'corrections',fixes,'replayed',false);
 UPDATE app.command_receipt SET status='succeeded',result=outcome,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command;
 -- Existing deferred link-audit guard requires this exact event ID and references.
 payload:=jsonb_build_object('references',jsonb_build_object('command',p_command::text,'link',link::text,'correction',correction::text,'authorization',auth::text,'environment','synthetic_demo'),'hashes',jsonb_build_object('content',h));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',link,'version','audit.v1','actorRef','membership:'||a::text,'eventType','contractor.extra.duplicate_linked','subjectType','extra','subjectRef',p_duplicate::text,'payload',payload)),'checked_operation');

 RETURN outcome;
END $$;
-- Latest main definition: packages/db/migrations/0372_free_first_job_admission.sql.
CREATE OR REPLACE FUNCTION app.mon3_audit(t uuid,actor uuid,command uuid,kind text,hash text,result_hash text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN


 payload:=jsonb_build_object('references',jsonb_build_object('commandId',command::text),'hashes',jsonb_build_object('request',hash,'result',result_hash));

 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||actor::text,'eventType','free_first_job.'||kind,'subjectType','tenant','subjectRef',t::text,'payload',payload)),'checked_operation');

END $$;
-- Latest main definition: packages/db/migrations/0387_customer_signin.sql.
CREATE OR REPLACE FUNCTION app.customer_portal_audit(t uuid,subject uuid,kind text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN


 payload:=jsonb_build_object('references',jsonb_build_object('subjectId',subject::text),'classifications',jsonb_build_object('action','security'));


 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','system:customer-portal','eventType','customer_portal.'||kind,'subjectType','customer_portal','subjectRef',subject::text,'payload',payload)),'checked_operation');

END $$;
COMMIT;
