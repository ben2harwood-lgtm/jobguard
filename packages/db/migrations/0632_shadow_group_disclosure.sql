BEGIN;
-- MIGFIX-7 / SV-2, SV-3. Forward-only; no stored-row shape, table grants or historical rows change.
-- Keep post-lock firing completion disabled: no routine or executor grant is introduced for it.
-- Existing disclosures remain historical facts; future group membership inherits their permanent exclusions.
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
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND (id=surv.id OR coalesced_into_signal_id=surv.id);
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT NEW.tenant_id,NEW.job_id,gen_random_uuid(),g.id,i.reason,i.source_ref
   FROM app.shadow_commercial_signal g CROSS JOIN app.shadow_signal_ineligibility i
   WHERE g.tenant_id=NEW.tenant_id AND g.job_id=NEW.job_id AND (g.id=surv.id OR g.coalesced_into_signal_id=surv.id)
    AND i.tenant_id=NEW.tenant_id AND i.job_id=NEW.job_id AND i.signal_id=NEW.id AND i.reason IN('disclosed_before_lock','surfaced_early')
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.propagate_shadow_group_disclosure() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.propagate_shadow_group_disclosure() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
CREATE TRIGGER shadow_group_disclosure AFTER UPDATE OF coalesced_into_signal_id ON app.shadow_commercial_signal
 FOR EACH ROW WHEN (OLD.coalesced_into_signal_id IS NULL AND NEW.coalesced_into_signal_id IS NOT NULL)
 EXECUTE FUNCTION app.propagate_shadow_group_disclosure();

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
 -- Serialize with group coalescence/disclosure before taking the job or signal locks.
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||p_tenant::text||':'||p_job::text,0));
 -- Consistent order: detection key, job, signal, business inserts, disclosure, audit head last.
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
COMMIT;
