BEGIN;
-- MIGFIX-7. Forward-only; no table, column, constraint or policy change; no row backfill.
-- (1) record_shadow_disclosure resolves and locks the survivor/group before applying monotonic
--     disclosure and ineligibility to every member (disclosing a coalesced duplicate used to leave
--     its survivor hidden and apparently fee-eligible).
-- (2) A trigger carries an already-disclosed survivor's disclosure onto a duplicate coalesced later.
-- (3) A separate post-lock completion routine finishes a mandatory firing for a signal that was
--     persisted before the final-account lock. Late disclosure is shown at once, records
--     before_lock=false and the real server time, and is fee-ineligible (Ben, 14 Oct, decision 8).
--     surface_shadow_signal_early is untouched and still refuses a locked job.
-- Lock order everywhere: detection advisory key, job row, group signal rows (id order), business
-- inserts, audit head last. The advisory key is the one the detection repository already takes.

CREATE OR REPLACE FUNCTION app.record_shadow_disclosure(p_tenant uuid,p_job uuid,p_signal uuid,p_event uuid,p_route text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE locked boolean:=false;prior app.shadow_disclosure_event;visible_at timestamptz;survivor uuid;members uuid[];
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_event IS NULL OR p_signal IS NULL OR p_job IS NULL OR p_route IS NULL OR p_route NOT IN ('must_surface_override','support_conversation','export','data_subject_access','defect','tell_me_now','trial_job_live','paid_human_review','drawing_review','upgrade_bridge') THEN RAISE EXCEPTION 'invalid disclosure' USING ERRCODE='22023'; END IF;
 IF p_route='support_conversation' AND NOT pg_has_role(session_user,'jobguard_shadow_emergency_access','USAGE') THEN
  RAISE EXCEPTION 'separate support permission required' USING ERRCODE='42501';
 END IF;
 -- Same key as the detection repository: coalescing only ever happens under it, so a disclosure
 -- is wholly before or wholly after any coalescing transaction for this job.
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||p_tenant::text||':'||p_job::text,0));
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO prior FROM app.shadow_disclosure_event WHERE tenant_id=p_tenant AND id=p_event;
 IF FOUND THEN
  IF ROW(prior.job_id,prior.signal_id,prior.route,prior.actor_ref) IS DISTINCT FROM ROW(p_job,p_signal,p_route,'role:'||session_user) THEN RAISE EXCEPTION 'disclosure replay conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.id;
 END IF;
 SELECT coalesce(coalesced_into_signal_id,id) INTO survivor FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT array_agg(g.id ORDER BY g.id) INTO members FROM (
  SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND (id=survivor OR coalesced_into_signal_id=survivor) ORDER BY id FOR UPDATE) g;
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job; END IF;
 INSERT INTO app.shadow_disclosure_event(tenant_id,job_id,id,signal_id,route,actor_ref,before_lock)
 VALUES(p_tenant,p_job,p_event,p_signal,p_route,'role:'||session_user,NOT locked) RETURNING created_at INTO visible_at;
 IF NOT locked THEN
  UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true,first_builder_visible_at=coalesce(first_builder_visible_at,visible_at),state='surfaced_early',revision=revision+1
   WHERE tenant_id=p_tenant AND job_id=p_job AND id=ANY(members);
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT p_tenant,p_job,gen_random_uuid(),m,r,p_event::text FROM unnest(members) m CROSS JOIN (VALUES('disclosed_before_lock'),('surfaced_early')) x(r)
  ON CONFLICT DO NOTHING;
 ELSE
  UPDATE app.shadow_commercial_signal SET first_builder_visible_at=coalesce(first_builder_visible_at,visible_at) WHERE tenant_id=p_tenant AND job_id=p_job AND id=ANY(members);
 END IF;
 PERFORM app.append_shadow_audit(p_event,p_job,'shadow.disclosed');
 RETURN p_event;
END $$;
ALTER FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text) TO jobguard_shadow,jobguard_shadow_emergency_access;

-- A duplicate coalesced into an already-disclosed survivor inherits its permanent exclusions and
-- first-visible time (and the reverse, defensively). Runs inside the coalescing statement's
-- transaction, which already holds the detection advisory key.
CREATE FUNCTION app.propagate_shadow_group_disclosure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE surv app.shadow_commercial_signal;
BEGIN
 SELECT * INTO surv FROM app.shadow_commercial_signal WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.coalesced_into_signal_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF surv.disclosed_before_lock AND NOT NEW.disclosed_before_lock THEN
  UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true,first_builder_visible_at=coalesce(first_builder_visible_at,surv.first_builder_visible_at),state='surfaced_early',revision=revision+1
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.id;
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT tenant_id,job_id,gen_random_uuid(),NEW.id,reason,source_ref FROM app.shadow_signal_ineligibility
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND signal_id=surv.id AND reason IN('disclosed_before_lock','surfaced_early') ON CONFLICT DO NOTHING;
 ELSIF NEW.disclosed_before_lock AND NOT surv.disclosed_before_lock THEN
  UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true,first_builder_visible_at=coalesce(first_builder_visible_at,NEW.first_builder_visible_at),state='surfaced_early',revision=revision+1
   WHERE tenant_id=surv.tenant_id AND job_id=surv.job_id AND id=surv.id;
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT tenant_id,job_id,gen_random_uuid(),surv.id,reason,source_ref FROM app.shadow_signal_ineligibility
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND signal_id=NEW.id AND reason IN('disclosed_before_lock','surfaced_early') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.propagate_shadow_group_disclosure() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.propagate_shadow_group_disclosure() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
CREATE TRIGGER shadow_group_disclosure AFTER UPDATE OF coalesced_into_signal_id ON app.shadow_commercial_signal
 FOR EACH ROW WHEN (OLD.coalesced_into_signal_id IS NULL AND NEW.coalesced_into_signal_id IS NOT NULL)
 EXECUTE FUNCTION app.propagate_shadow_group_disclosure();

-- Post-lock completion of a persisted mandatory firing. Same checks, ids and replay identity as
-- surface_shadow_signal_early, except the job MUST be locked and the signal MUST have been persisted
-- before the lock. EXECUTE is deliberately NOT granted to any login here (see the receipt): granting
-- it to jobguard_shadow changes the merged shadow-catalog pin and LP-0 inventory.
CREATE FUNCTION app.complete_shadow_firing_post_lock(
 p_tenant uuid,p_job uuid,p_signal uuid,p_firing uuid,p_decision uuid,p_disclosure uuid,
 p_rule text,p_version text,p_source uuid,p_object_version text,p_facts jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE s app.shadow_commercial_signal; prior app.shadow_must_surface_firing;
 request_hash text;finding uuid:=p_firing;audit_id uuid:=p_firing;lock_at timestamptz;
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
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||p_tenant::text||':'||p_job::text,0));
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
 IF to_regclass('app.final_check_terms_acceptance') IS NULL THEN RAISE EXCEPTION 'TERMS_RELATION_UNAVAILABLE' USING ERRCODE='55000'; END IF;
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=$1 AND terms_version=$2)'
  INTO terms_accepted USING p_tenant,'synthetic_final_check_terms.v1';
 IF terms_accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'TERMS_NOT_ACCEPTED' USING ERRCODE='55000'; END IF;
 IF to_regclass('app.final_account_lock') IS NULL THEN RAISE EXCEPTION 'post-lock completion requires a locked job' USING ERRCODE='55000'; END IF;
 EXECUTE 'SELECT locked_at FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2' INTO lock_at USING p_tenant,p_job;
 IF lock_at IS NULL THEN RAISE EXCEPTION 'post-lock completion requires a locked job' USING ERRCODE='55000'; END IF;
 -- Only a mandatory signal that was already persisted before the lock; never a detection made after it.
 IF s.must_surface_now IS DISTINCT FROM true OR s.created_at>=lock_at OR s.coalesced_into_signal_id IS NOT NULL
  OR s.state NOT IN('candidate','held_for_final_check','surfaced_early') THEN
  RAISE EXCEPTION 'invalid post-lock completion subject' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM app.shadow_signal_evidence WHERE tenant_id=p_tenant AND job_id=p_job AND signal_id=p_signal AND evidence_id=p_source AND object_version_id=p_object_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow source mismatch' USING ERRCODE='23503'; END IF;
 -- Lock the whole group, then every business insert, then disclosure, audit head last.
 PERFORM 1 FROM (SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND (id=p_signal OR coalesced_into_signal_id=p_signal) ORDER BY id FOR UPDATE) g;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(p_decision,p_tenant,'shadow_signal',p_signal::text,'review_must_surface_signal');
 INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision)
 VALUES(finding,p_tenant,p_job,p_decision,request_hash,'must_surface_signal','mandatory',left(s.description,160),'',p_signal::text,'review_must_surface_signal',s.revision);
 INSERT INTO app.shadow_must_surface_firing(tenant_id,job_id,id,signal_id,rule,rule_version,source_ref,object_version_id,decision_id,finding_id,disclosure_event_id,audit_event_id,facts,request_hash,actor_ref)
 VALUES(p_tenant,p_job,p_firing,p_signal,p_rule,p_version,p_source,p_object_version,p_decision,finding,p_disclosure,audit_id,p_facts,request_hash,actor);
 -- Permanent no-fee exclusion for the whole group. Not labelled disclosed_before_lock: it was not.
 INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
 SELECT p_tenant,p_job,gen_random_uuid(),g.id,'evidence_after_lock','post_lock_completion:'||p_firing::text
 FROM app.shadow_commercial_signal g WHERE g.tenant_id=p_tenant AND g.job_id=p_job AND (g.id=p_signal OR g.coalesced_into_signal_id=p_signal)
 ON CONFLICT DO NOTHING;
 -- Locked branch of the disclosure routine: before_lock=false, real server time, no pre-lock flags.
 PERFORM app.record_shadow_disclosure(p_tenant,p_job,p_signal,p_disclosure,'must_surface_override');
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1;ts:=date_trunc('milliseconds',clock_timestamp());
 payload_text:='{"classifications":{"action":"operational"},"references":{"decisionId":"'||p_decision::text||'","firingId":"'||p_firing::text||'","jobId":"'||p_job::text||'","rule":"'||p_rule||'","ruleVersion":"'||p_version||'","signalId":"'||p_signal::text||'"}}';
 ph:=encode(sha256(convert_to(payload_text,'UTF8')),'hex');
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',p_tenant::text,seq::text,actor,'shadow.must_surface_fired','job',p_job::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(audit_id,p_tenant,seq,'audit.v1',actor,'shadow.must_surface_fired','job',p_job::text,ts,payload_text::jsonb,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN p_decision;
END $$;
ALTER FUNCTION app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
COMMIT;
