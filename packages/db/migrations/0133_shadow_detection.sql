BEGIN;
-- Expand-compatible: the three original kind values and every earlier constraint survive.
ALTER TABLE app.job_finding DROP CONSTRAINT job_finding_kind_check;
ALTER TABLE app.job_finding ADD CONSTRAINT job_finding_kind_check
 CHECK(kind IN('unresolved_question','required_proof','materials_bill_review','must_surface_signal'));

ALTER TABLE app.job_finding ADD CONSTRAINT job_finding_tenant_job_id_decision_key UNIQUE(tenant_id,job_id,id,decision_id);
ALTER TABLE app.shadow_disclosure_event ADD CONSTRAINT shadow_disclosure_event_tenant_job_id_key UNIQUE(tenant_id,job_id,id);

-- The database binds finding/decision and disclosure to the firing's tenant/job.
-- The controlled routine's job/subject checks remain a second layer.
CREATE TABLE app.shadow_must_surface_firing (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,signal_id uuid NOT NULL,
 rule varchar(40) NOT NULL CHECK(rule IN('safety','prior_written_agreement','worsening_dispute','disclosure_duty')),
 rule_version varchar(80) NOT NULL CHECK(rule_version='shadow_attribution_policy_v3'),
 source_ref uuid NOT NULL,object_version_id varchar(300) NOT NULL,
 decision_id uuid NOT NULL,finding_id uuid NOT NULL,disclosure_event_id uuid NOT NULL,audit_event_id uuid NOT NULL,
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),request_hash char(64) NOT NULL CHECK(request_hash~'^[a-f0-9]{64}$'),
 actor_ref varchar(200) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,job_id,signal_id,rule,rule_version,source_ref),
 UNIQUE(tenant_id,decision_id),UNIQUE(tenant_id,disclosure_event_id),UNIQUE(tenant_id,audit_event_id),
 FOREIGN KEY(tenant_id,job_id,signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,signal_id,source_ref,object_version_id)
  REFERENCES app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id),
 FOREIGN KEY(tenant_id,job_id,finding_id,decision_id) REFERENCES app.job_finding(tenant_id,job_id,id,decision_id),
 FOREIGN KEY(tenant_id,job_id,disclosure_event_id) REFERENCES app.shadow_disclosure_event(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE app.shadow_must_surface_firing OWNER TO jobguard_migration;
ALTER TABLE app.shadow_must_surface_firing ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.shadow_must_surface_firing FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.shadow_must_surface_firing FOR ALL TO jobguard_shadow,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.shadow_must_surface_firing FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow_emergency_access,jobguard_shadow;
GRANT SELECT ON app.shadow_must_surface_firing TO jobguard_shadow;
CREATE TRIGGER shadow_firing_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON app.shadow_must_surface_firing
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- Only this routine may create the firing; its checks reinforce the database job bindings.
CREATE FUNCTION app.surface_shadow_signal_early(
 p_tenant uuid,p_job uuid,p_signal uuid,p_firing uuid,p_decision uuid,p_disclosure uuid,
 p_rule text,p_version text,p_source uuid,p_object_version text,p_facts jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
ALTER FUNCTION app.surface_shadow_signal_early(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.surface_shadow_signal_early(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.surface_shadow_signal_early(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb) TO jobguard_shadow;
COMMIT;
