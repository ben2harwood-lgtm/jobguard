BEGIN;
-- M5-11: synthetic inventory only. Existing tenant policies and zero runtime table grants remain unchanged.
ALTER TABLE app.privacy_request DROP CONSTRAINT privacy_request_operation_check;
ALTER TABLE app.privacy_request ADD CONSTRAINT privacy_request_operation_check CHECK(operation IN('access','export','delete','offboard'));
ALTER TABLE app.privacy_request ADD COLUMN expanded boolean NOT NULL DEFAULT false,
 ADD COLUMN review_record jsonb, ADD COLUMN execution_receipt jsonb;
ALTER TABLE app.privacy_artifact DROP CONSTRAINT privacy_artifact_category_check;
ALTER TABLE app.privacy_artifact ADD CONSTRAINT privacy_artifact_category_check CHECK(category IN(
 'source','derived','accounting','legal','log','backup','queued_work','inflight_work','access_grant',
 'observation','model','cache','native','connector','connector_copy','locked_evidence','key','consent'));
ALTER TABLE app.privacy_artifact DROP CONSTRAINT privacy_artifact_state_check;
ALTER TABLE app.privacy_artifact ADD CONSTRAINT privacy_artifact_state_check CHECK(state IN(
 'active','redacted','retained','cancelled','outcome_unknown','revoked','disconnected','pending'));
ALTER TABLE app.privacy_artifact ADD COLUMN hold_ref uuid, ADD COLUMN retention_basis text,
 ADD COLUMN retention_review_ref uuid, ADD COLUMN expiry_at timestamptz;
CREATE OR REPLACE FUNCTION app.privacy_command(t uuid,digest text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; c uuid; req app.privacy_request; subj app.privacy_subject; previous app.privacy_command;
 seq bigint; previous_hash text; ts timestamptz; audit_payload jsonb; ph text; eh text;
 expanded boolean:=v->>'version'='privacy-command.v2'; snapshot text; receipt jsonb;
 action text:=v->>'action'; allowed text[]; result jsonb; doc jsonb;
BEGIN
 -- Trusted database boundary, independent of the HTTP flag and environment.
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'PRIVACY_DISABLED' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,539));
 actor:=app.mon1_company_actor(t,digest);
 allowed:=CASE action WHEN 'open' THEN ARRAY['subjectId','operation'] WHEN 'instruct' THEN ARRAY['requestId','expectedRevision','instructionRef','instructionHash'] WHEN 'execute' THEN ARRAY['requestId','expectedRevision'] WHEN 'review' THEN ARRAY['requestId','expectedRevision','identityRef','authorityRef','retentionReviewRef','reviewHash'] END;
 IF allowed IS NULL OR jsonb_typeof(v)<>'object' OR (v->>'version' IS NULL OR v->>'version' NOT IN('privacy-command.v1','privacy-command.v2')) OR (action='review' AND NOT expanded)
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
  IF action='review' THEN
   IF req.state<>'ready' OR req.review_record IS NOT NULL OR v->>'reviewHash' IS NULL OR v->>'reviewHash' !~ '^[a-f0-9]{64}$'
    OR (v->>'identityRef')::uuid IS NULL OR (v->>'authorityRef')::uuid IS NULL OR (v->>'retentionReviewRef')::uuid IS NULL
   THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
   SELECT app.final_lock_hash(jsonb_build_object('artifacts',coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'),
     'subjects',(SELECT coalesce(jsonb_agg(to_jsonb(ps) ORDER BY ps.id),'[]') FROM app.privacy_subject ps
      WHERE ps.tenant_id=t AND (ps.id=req.subject_id OR req.operation='offboard')))) INTO snapshot
    FROM app.privacy_artifact a WHERE tenant_id=t AND (subject_id=req.subject_id OR req.operation='offboard');
   UPDATE app.privacy_request SET review_record=jsonb_build_object('identityRef',v->>'identityRef','authorityRef',v->>'authorityRef',
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
 INSERT INTO app.privacy_command(tenant_id,command_id,request_id,actor_id,payload,result) VALUES(t,c,req.id,actor,v,result);
 -- Reuse the existing append-only chain writer; no content/contact data enters audit.
 SELECT sequence,event_hash INTO seq,previous_hash FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 audit_payload:=jsonb_build_object('references',jsonb_build_object('commandId',c::text),'hashes',jsonb_build_object('request',app.final_lock_hash(v),'result',app.final_lock_hash(result)));
 ph:=app.final_lock_hash(audit_payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'privacy.'||action,'privacy_request',req.id::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous_hash,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||actor::text,'privacy.'||action,'privacy_request',req.id::text,ts,audit_payload,ph,previous_hash,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION app.privacy_read(t uuid,digest text,r uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE req app.privacy_request;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'PRIVACY_DISABLED' USING ERRCODE='42501'; END IF;
 PERFORM app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,539));
 PERFORM app.mon1_company_actor(t,digest);
 SELECT * INTO req FROM app.privacy_request WHERE tenant_id=t AND id=r;
 IF req.id IS NULL THEN RAISE EXCEPTION 'PRIVACY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('version','privacy-read.v1','requestId',req.id,'state',req.state,'revision',req.revision,'controller',req.controller,
  'operation',req.operation,'receipt',req.execution_receipt,'review',req.review_record,'instructionRef',req.instruction_ref,'instructionHash',req.instruction_hash,'instructionActor',req.instruction_actor,
  'instructionAt',req.instruction_at,'document',req.export_document,'synthetic',true,'backupsErased',false,'policyVersion',CASE WHEN req.expanded THEN 'privacy_rehearsal_v2' ELSE 'privacy_rehearsal_v1' END);
END $$;
-- A tenant exit fences new fictional intake/work; reads of receipts remain available to current operators.
CREATE FUNCTION app.privacy_inventory_fence() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,539));
 IF TG_TABLE_NAME='privacy_subject' THEN
  IF EXISTS(SELECT 1 FROM app.privacy_request WHERE tenant_id=NEW.tenant_id AND operation='offboard' AND state='rehearsed') THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' OR NEW.state='active' THEN
  IF EXISTS(SELECT 1 FROM app.privacy_request WHERE tenant_id=NEW.tenant_id AND operation='offboard' AND state='rehearsed') THEN
   RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF TG_TABLE_NAME='privacy_artifact' THEN
   IF EXISTS(SELECT 1 FROM app.privacy_subject WHERE tenant_id=NEW.tenant_id AND id=NEW.subject_id AND revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.privacy_inventory_fence() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.privacy_inventory_fence() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER privacy_inventory_fence BEFORE INSERT OR UPDATE ON app.privacy_artifact FOR EACH ROW EXECUTE FUNCTION app.privacy_inventory_fence();
CREATE TRIGGER privacy_inventory_fence BEFORE INSERT ON app.privacy_subject FOR EACH ROW EXECUTE FUNCTION app.privacy_inventory_fence();
COMMIT;
