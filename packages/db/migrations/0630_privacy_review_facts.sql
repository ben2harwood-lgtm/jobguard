BEGIN;
-- M5-11: recorded checks for fictional privacy rehearsals only; no new runtime grants.
CREATE TABLE app.privacy_review_fact (
 tenant_id uuid NOT NULL, id uuid NOT NULL, request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('identity','authority')),
 method text NOT NULL CHECK(method='synthetic_fixture'),
 evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[a-fA-F0-9]{64}$'),
 verified_by uuid NOT NULL, verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES app.privacy_request(tenant_id,id),
 FOREIGN KEY(tenant_id,verified_by) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.privacy_review_fact OWNER TO jobguard_migration;
ALTER TABLE app.privacy_review_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.privacy_review_fact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.privacy_review_fact FOR ALL TO jobguard_migration
 USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN nullif(current_setting('app.tenant_id',true),'')::uuid END)
 WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN nullif(current_setting('app.tenant_id',true),'')::uuid END);
REVOKE ALL ON app.privacy_review_fact FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.privacy_review_fact
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE OR REPLACE FUNCTION app.privacy_command(t uuid,digest text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; c uuid; req app.privacy_request; subj app.privacy_subject; previous app.privacy_command;
 audit_payload jsonb; fact app.privacy_review_fact; identity_fact app.privacy_review_fact; authority_fact app.privacy_review_fact;
 expanded boolean:=v->>'version'='privacy-command.v2'; snapshot text; receipt jsonb;
 action text:=v->>'action'; allowed text[]; result jsonb; doc jsonb;
BEGIN
 -- Trusted database boundary, independent of the HTTP flag and environment.
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'PRIVACY_DISABLED' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,539));
 actor:=app.mon1_company_actor(t,digest);
 allowed:=CASE action WHEN 'open' THEN ARRAY['subjectId','operation'] WHEN 'instruct' THEN ARRAY['requestId','expectedRevision','instructionRef','instructionHash'] WHEN 'execute' THEN ARRAY['requestId','expectedRevision'] WHEN 'verify' THEN ARRAY['requestId','expectedRevision','kind','evidenceHash'] WHEN 'review' THEN ARRAY['requestId','expectedRevision','identityRef','authorityRef','retentionReviewRef','reviewHash'] END;
 IF allowed IS NULL OR jsonb_typeof(v)<>'object' OR (v->>'version' IS NULL OR v->>'version' NOT IN('privacy-command.v1','privacy-command.v2')) OR (action IN('review','verify') AND NOT expanded)
 OR NOT v ?& (allowed||ARRAY['version','commandId','action']) OR v-(allowed||ARRAY['version','commandId','action'])<>'{}'
 THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
 c:=(v->>'commandId')::uuid;
 IF c IS NULL THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM app.privacy_command WHERE tenant_id=t AND command_id=c;
 IF previous.command_id IS NOT NULL THEN
  IF previous.payload IS DISTINCT FROM v OR previous.actor_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN previous.result;
 END IF;
 IF action='open' THEN
  SELECT * INTO subj FROM app.privacy_subject WHERE tenant_id=t AND id=(v->>'subjectId')::uuid FOR UPDATE;
  IF subj.id IS NULL THEN RAISE EXCEPTION 'PRIVACY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v->>'operation' IS NULL OR v->>'operation' NOT IN('access','export','delete','offboard') OR (v->>'operation'='offboard' AND (NOT expanded OR subj.kind<>'builder')) THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM app.privacy_request WHERE tenant_id=t AND operation='offboard' AND state='rehearsed') THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO app.privacy_request(tenant_id,id,subject_id,operation,controller,state,opened_by,expanded)
  VALUES(t,gen_random_uuid(),subj.id,v->>'operation',CASE WHEN subj.kind='builder' AND v->>'operation'<>'offboard' THEN 'jobguard' ELSE 'contractor' END,
   CASE WHEN subj.kind='builder' AND v->>'operation'<>'offboard' THEN 'ready' ELSE 'awaiting_instruction' END,actor,expanded) RETURNING * INTO req;
 ELSE
  SELECT * INTO req FROM app.privacy_request WHERE tenant_id=t AND id=(v->>'requestId')::uuid FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'PRIVACY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF req.expanded IS DISTINCT FROM expanded THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(v->'expectedRevision') IS DISTINCT FROM 'number' OR v->>'expectedRevision' !~ '^[0-9]+$'
  THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
  IF req.revision<>(v->>'expectedRevision')::integer OR req.state='rehearsed' THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
  IF action='verify' THEN
   IF req.review_record IS NOT NULL OR v->>'kind' IS NULL OR v->>'kind' NOT IN('identity','authority')
    OR jsonb_typeof(v->'evidenceHash') IS DISTINCT FROM 'string' OR v->>'evidenceHash' !~ '^[a-fA-F0-9]{64}$'
   THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
   INSERT INTO app.privacy_review_fact(tenant_id,id,request_id,kind,method,evidence_hash,verified_by)
    VALUES(t,gen_random_uuid(),req.id,v->>'kind','synthetic_fixture',v->>'evidenceHash',actor) RETURNING * INTO fact;
   UPDATE app.privacy_request SET revision=revision+1 WHERE tenant_id=t AND id=req.id RETURNING * INTO req;
  ELSIF action='review' THEN
   IF req.state<>'ready' OR req.review_record IS NOT NULL OR v->>'reviewHash' IS NULL OR v->>'reviewHash' !~ '^[a-f0-9]{64}$'
    OR (v->>'identityRef')::uuid IS NULL OR (v->>'authorityRef')::uuid IS NULL OR (v->>'retentionReviewRef')::uuid IS NULL
   THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
   SELECT * INTO identity_fact FROM app.privacy_review_fact
    WHERE tenant_id=t AND request_id=req.id AND id=(v->>'identityRef')::uuid AND kind='identity';
   SELECT * INTO authority_fact FROM app.privacy_review_fact
    WHERE tenant_id=t AND request_id=req.id AND id=(v->>'authorityRef')::uuid AND kind='authority';
   IF identity_fact.id IS NULL OR authority_fact.id IS NULL
   THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
   SELECT app.final_lock_hash(jsonb_build_object('artifacts',coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'),
     'subjects',(SELECT coalesce(jsonb_agg(to_jsonb(ps) ORDER BY ps.id),'[]') FROM app.privacy_subject ps
      WHERE ps.tenant_id=t AND (ps.id=req.subject_id OR req.operation='offboard')))) INTO snapshot
    FROM app.privacy_artifact a WHERE tenant_id=t AND (subject_id=req.subject_id OR req.operation='offboard');
   UPDATE app.privacy_request SET review_record=jsonb_build_object('identityRef',v->>'identityRef','authorityRef',v->>'authorityRef',
    'identityMethod',identity_fact.method,'authorityMethod',authority_fact.method,
    'retentionReviewRef',v->>'retentionReviewRef','reviewHash',v->>'reviewHash','actor',actor,'at',clock_timestamp(),'inventoryHash',snapshot),revision=revision+1
    WHERE tenant_id=t AND id=req.id RETURNING * INTO req;
  ELSIF action='instruct' THEN
   IF req.controller<>'contractor' OR req.state<>'awaiting_instruction' OR v->>'instructionHash' IS NULL OR v->>'instructionHash' !~ '^[a-f0-9]{64}$' OR (v->>'instructionRef')::uuid IS NULL
   THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
   UPDATE app.privacy_request SET state='ready',revision=revision+1,instruction_ref=(v->>'instructionRef')::uuid,
    instruction_hash=v->>'instructionHash',instruction_actor=actor,instruction_at=clock_timestamp() WHERE tenant_id=t AND id=req.id RETURNING * INTO req;
  ELSE
   IF req.state<>'ready' THEN RAISE EXCEPTION 'PRIVACY_INSTRUCTION_REQUIRED' USING ERRCODE='42501'; END IF;
   IF EXISTS(SELECT 1 FROM app.privacy_request WHERE tenant_id=t AND operation='offboard' AND state='rehearsed') THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
   PERFORM 1 FROM app.privacy_subject WHERE tenant_id=t AND id=req.subject_id FOR UPDATE;
   IF expanded THEN
    SELECT app.final_lock_hash(jsonb_build_object('artifacts',coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'),
     'subjects',(SELECT coalesce(jsonb_agg(to_jsonb(ps) ORDER BY ps.id),'[]') FROM app.privacy_subject ps
      WHERE ps.tenant_id=t AND (ps.id=req.subject_id OR req.operation='offboard')))) INTO snapshot
     FROM app.privacy_artifact a WHERE tenant_id=t AND (subject_id=req.subject_id OR req.operation='offboard');
    IF req.review_record IS NULL OR req.review_record->>'inventoryHash' IS DISTINCT FROM snapshot
    THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
   ELSIF EXISTS(SELECT 1 FROM app.privacy_artifact WHERE tenant_id=t AND subject_id=req.subject_id
    AND (category NOT IN('source','derived','accounting','legal','log','backup','queued_work','inflight_work','access_grant') OR hold_ref IS NOT NULL)) THEN
    RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023';
   END IF;
   IF req.operation IN('delete','offboard') THEN
    -- Cancel queued work, fence access, reconcile in-flight outcomes. Never retry
    -- unknown provider results and never mutate retained commercial/audit facts.
    UPDATE app.privacy_subject SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE tenant_id=t AND (id=req.subject_id OR req.operation='offboard');
    UPDATE app.privacy_artifact SET
     payload=CASE WHEN hold_ref IS NULL AND category IN('source','derived','observation','model','cache','log','queued_work','access_grant','consent','connector') THEN NULL ELSE payload END,
     state=CASE WHEN category='queued_work' THEN 'cancelled' WHEN category='inflight_work' THEN 'outcome_unknown'
      WHEN category IN('access_grant','consent') THEN 'revoked' WHEN category='connector' THEN 'disconnected'
      WHEN hold_ref IS NOT NULL THEN 'retained'
      WHEN category IN('source','derived','observation','model','cache','log') THEN 'redacted'
      WHEN category='queued_work' THEN 'cancelled' WHEN category='inflight_work' THEN 'outcome_unknown'
      WHEN category IN('access_grant','consent') THEN 'revoked' WHEN category='connector' THEN 'disconnected'
      WHEN category IN('native','connector_copy','backup','key') THEN 'pending' ELSE 'retained' END
     WHERE tenant_id=t AND (subject_id=req.subject_id OR req.operation='offboard');
    UPDATE app.privacy_request SET export_document=NULL WHERE tenant_id=t AND (subject_id=req.subject_id OR req.operation='offboard');
   ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'state',state,'data',payload) ORDER BY id),'[]') INTO doc
     FROM app.privacy_artifact WHERE tenant_id=t AND subject_id=req.subject_id AND category NOT IN('backup','queued_work','inflight_work','access_grant','consent','key','native','connector','connector_copy');
   END IF;
   SELECT jsonb_build_object('version','privacy-receipt.v2','scope',CASE WHEN req.operation='offboard' THEN 'tenant' ELSE 'subject' END,
    'completed',coalesce(jsonb_agg(jsonb_build_object('artifactId',id,'category',category,'action',
     CASE WHEN req.operation IN('access','export') THEN 'included_in_document' ELSE state END) ORDER BY id)
     FILTER(WHERE (req.operation IN('access','export') AND category NOT IN('backup','queued_work','inflight_work','access_grant','consent','key','native','connector','connector_copy'))
      OR (req.operation IN('delete','offboard') AND state IN('redacted','cancelled','revoked','disconnected'))),'[]'),
    'exceptions',coalesce(jsonb_agg(jsonb_build_object('artifactId',id,'category',category,'reason',CASE WHEN hold_ref IS NOT NULL THEN 'legal_hold' WHEN req.operation IN('access','export') AND category IN('queued_work','access_grant','consent','connector') THEN 'excluded_operational_record' ELSE 'retention_review_required' END,
      'holdRef',hold_ref,'retentionBasis',retention_basis,'reviewRef',retention_review_ref) ORDER BY id) FILTER(WHERE hold_ref IS NOT NULL OR state='retained' OR category IN('locked_evidence','accounting','legal')
      OR (req.operation IN('access','export') AND category IN('queued_work','access_grant','consent','connector'))),'[]'),
    'pending',coalesce(jsonb_agg(jsonb_build_object('artifactId',id,'category',category,'reason',CASE WHEN category='inflight_work' THEN 'reconcile_unknown_outcome'
     WHEN category='native' THEN 'device_ack_required' WHEN category='key' THEN 'retained_dependencies_review' WHEN category='connector_copy' THEN 'controller_provider_ack_required' ELSE 'verified_expiry_required' END,
     'expiryAt',expiry_at) ORDER BY id) FILTER(WHERE category IN('backup','native','key','connector_copy','inflight_work')),'[]'),
    'review',req.review_record,'backupsErased',false,'offlineDevicesErased',false,'realExternalActions',0,'newCharges',0,'financialObligations','reconcile_existing_only','policyApproval','pending_D07_D12','inventoryClasses',18,
    'status','rehearsed_with_exceptions','synthetic',true) INTO receipt
    FROM app.privacy_artifact WHERE tenant_id=t AND (subject_id=req.subject_id OR req.operation='offboard');
   UPDATE app.privacy_request SET state='rehearsed',revision=revision+1,completed_at=clock_timestamp(),export_document=doc,execution_receipt=receipt
    WHERE tenant_id=t AND id=req.id RETURNING * INTO req;
  END IF;
 END IF;
 result:=jsonb_build_object('version','privacy-result.v1','requestId',req.id,'revision',req.revision,'state',req.state,'controller',req.controller,
  'operation',req.operation,'receipt',req.execution_receipt,'policyVersion',CASE WHEN req.expanded THEN 'privacy_rehearsal_v2' ELSE 'privacy_rehearsal_v1' END,'synthetic',true,'realExternalActions',0,'backupsErased',false);
 IF action='verify' THEN result:=result||jsonb_build_object('factId',fact.id); END IF;
 INSERT INTO app.privacy_command(tenant_id,command_id,request_id,actor_id,payload,result) VALUES(t,c,req.id,actor,v,result);
 -- Seal the event through main's restricted audit writer after all business locks.
 audit_payload:=jsonb_build_object('references',jsonb_build_object('commandId',c::text),'hashes',jsonb_build_object('request',app.final_lock_hash(v),'result',app.final_lock_hash(result)));
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||actor::text,'eventType','privacy.'||action,'subjectType','privacy_request',
  'subjectRef',req.id::text,'payload',audit_payload)),'checked_operation');
 RETURN result;
END $$;
COMMIT;
