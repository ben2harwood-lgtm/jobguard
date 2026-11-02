BEGIN;
-- MON-4B: one review rule for statement approval and dispatch. Caller holds the
-- payment_fee_actor case/allocation/session locks; helper grants no runtime access.
CREATE OR REPLACE FUNCTION app.payment_fee_review_deadline(t uuid,j uuid,allocation_sources jsonb,actor uuid)
 RETURNS timestamptz LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE source jsonb; assessment app.recovery_attribution_revision; review app.action_authorization;
 live jsonb; deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
   -- A priced statement is only an illustration until each contributing SV-6
   -- assessment has its own exact, current approved review. Match the latest
   -- revision for the allocation subject, not just the first pricing proof.
   FOR source IN SELECT value FROM jsonb_array_elements(allocation_sources->'allocations') LOOP
    SELECT * INTO assessment FROM app.recovery_attribution_revision r
     WHERE r.tenant_id=t AND r.job_id=j
      AND (r.case_id,r.work_id,r.line_id,r.lock_id)=((source->>'caseId')::uuid,(source->>'workId')::uuid,(source->>'lineId')::uuid,(source->>'lockId')::uuid)
     ORDER BY r.revision DESC LIMIT 1;
    SELECT a.* INTO review FROM app.recovery_attribution_command cmd
     JOIN app.action_authorization a ON a.tenant_id=cmd.tenant_id AND a.id::text=cmd.first_result->>'reviewAuthorizationId'
     JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
     JOIN app.decision dec ON(dec.tenant_id,dec.id)=(a.tenant_id,a.decision_id)
     WHERE cmd.tenant_id=t AND cmd.job_id=j AND cmd.assessment_id=assessment.id AND cmd.payload->>'action'='approve_review'
      AND a.action_type='recovery.attribution_review' AND a.recipient=assessment.id::text
      AND a.content_hash=app.final_lock_hash(assessment.document) AND a.aggregate_revision=assessment.revision
      AND a.policy_version=assessment.document->>'eligibilityPolicyVersion'
      AND a.actor_membership_id=cmd.actor_membership_id AND dr.actor_membership_id=cmd.actor_membership_id
      AND dec.subject_type='recovery_attribution' AND dec.subject_ref=assessment.id::text AND dec.action_type=a.action_type
      AND dr.resolution='approved' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
     FOR SHARE OF a;
    IF review.id IS NULL OR review.revoked_at IS NOT NULL OR review.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PAYMENT_FEE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
    deadline:=least(deadline,review.expires_at);
    live:=app.recovery_attribution_sources(t,j,assessment.document,actor);
    IF live->>'sourceHash' IS DISTINCT FROM assessment.source_hash
     OR (live->>'caseRevision')::integer IS DISTINCT FROM assessment.case_revision
    THEN RAISE EXCEPTION 'PAYMENT_FEE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
   END LOOP;
 RETURN deadline;
END $$;
ALTER FUNCTION app.payment_fee_review_deadline(uuid,uuid,jsonb,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.payment_fee_review_deadline(uuid,uuid,jsonb,uuid)
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE OR REPLACE FUNCTION app.write_payment_fee(j uuid,d text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; cid uuid; action text:=p->>'action';
 replay app.payment_fee_command; st app.payment_fee_statement; previous record;
 sources jsonb; priors jsonb:='[]'; parts jsonb:='[]'; pair numeric[]; total numeric[];
 prior_fee bigint:=0; fee bigint; cumulative bigint; doc jsonb; sid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid();
 resolution uuid:=gen_random_uuid(); auth uuid; result jsonb; state text;
 deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
 actor:=app.payment_fee_actor(j,d);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'payment-fee-command.v1'
 OR action IS NULL OR action NOT IN('prepare','approve','dispute') OR NOT(p ?& ARRAY['version','commandId','action'])
 OR (action='prepare' AND (NOT(p ? 'paymentId') OR p-ARRAY['version','commandId','action','paymentId']<>'{}'::jsonb))
 OR (action='approve' AND (NOT(p ?& ARRAY['statementId','statementHash']) OR p-ARRAY['version','commandId','action','statementId','statementHash']<>'{}'::jsonb))
 OR (action='dispute' AND (NOT(p ? 'statementId') OR p-ARRAY['version','commandId','action','statementId']<>'{}'::jsonb))
 THEN RAISE EXCEPTION 'INVALID_PAYMENT_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p->>'commandId')::uuid;
 IF cid IS NULL OR (action='prepare' AND (p->>'paymentId')::uuid IS NULL) OR (action<>'prepare' AND (p->>'statementId')::uuid IS NULL)
 THEN RAISE EXCEPTION 'INVALID_PAYMENT_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 -- Tenant-wide command identity, locked before any audit head.
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-fee-command:'||t::text||':'||cid::text,0));
 SELECT * INTO replay FROM app.payment_fee_command WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF replay.job_id<>j OR replay.actor_membership_id<>actor OR replay.payload<>p
  THEN RAISE EXCEPTION 'PAYMENT_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  -- Saved result is a receipt, never an execution token. Current state is read separately.
  RETURN replay.result;
 END IF;
 IF action='prepare' THEN
  SELECT * INTO st FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=j AND payment_id=(p->>'paymentId')::uuid;
  IF st.id IS NOT NULL THEN
   state:=app.payment_fee_current(t,j,st.id,actor);
   IF state IN('disputed','source_changed') THEN RAISE EXCEPTION 'PAYMENT_FEE_REASSESSMENT_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  IF st.id IS NULL THEN
   sources:=app.payment_fee_receipt_sources(t,j,(p->>'paymentId')::uuid,actor);
   -- The serial statement order is server-owned, one immutable statement per
   -- receipt. Prior receipt fees telescope to the rounded cumulative fee.
   FOR previous IN SELECT * FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=j ORDER BY created_at,id LOOP
    state:=app.payment_fee_current(t,j,previous.id,actor);
    IF state IN('disputed','source_changed') THEN RAISE EXCEPTION 'PAYMENT_FEE_REASSESSMENT_REQUIRED' USING ERRCODE='23514'; END IF;
    parts:=parts||jsonb_build_array(jsonb_build_array(previous.document->'qualifyingNet'->>'numerator',previous.document->'qualifyingNet'->>'denominator'));
    prior_fee:=prior_fee+(previous.document->>'feePence')::bigint;
    priors:=priors||jsonb_build_array(jsonb_build_object('statementId',previous.id,'statementHash',previous.document->>'statementHash'));
   END LOOP;
   pair:=app.recovery_allocation_fraction_sum(parts);
   total:=app.recovery_allocation_fraction_sum(parts||jsonb_build_array(jsonb_build_array(sources->'qualifyingNet'->>'numerator',sources->'qualifyingNet'->>'denominator')));
   IF prior_fee<>app.ef_round_half_even(pair[1],pair[2]*10) THEN RAISE EXCEPTION 'PAYMENT_FEE_REASSESSMENT_REQUIRED' USING ERRCODE='23514'; END IF;
   cumulative:=app.ef_round_half_even(total[1],total[2]*10);
   fee:=cumulative-prior_fee;
   IF fee<0 OR fee>1000000000000 OR total[1]>1000000000000*total[2] THEN RAISE EXCEPTION 'PAYMENT_FEE_REASSESSMENT_REQUIRED' USING ERRCODE='23514'; END IF;
   doc:=jsonb_build_object('version','payment-fee-statement.v1','statementId',sid,'jobId',j,'paymentId',p->>'paymentId','revision',1,
    'sourceHash',app.final_lock_hash(jsonb_build_object('receipt',sources,'priorStatements',priors)),
    'qualifyingNet',sources->'qualifyingNet','priorQualifyingNet',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text),
    'paymentReceivedPence',(sources->>'receivedPence')::bigint,'feePence',fee,'priorFeePence',prior_fee,'cumulativeFeePence',cumulative,
    'policyVersion','reference_fee_policy_v3','environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
   doc:=doc||jsonb_build_object('statementHash',app.final_lock_hash(doc));
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'payment_fee_statement',sid::text,'payment_fee.collect');
   INSERT INTO app.payment_fee_statement(tenant_id,job_id,id,payment_id,document,sources,prior_statements,decision_id,actor_membership_id)
    VALUES(t,j,sid,(p->>'paymentId')::uuid,doc,sources,priors,decision,actor) RETURNING * INTO st;
  END IF;
 ELSE
  SELECT * INTO st FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=j AND id=(p->>'statementId')::uuid;
  IF st.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  IF action='approve' THEN
   state:=app.payment_fee_current(t,j,st.id,actor);
   IF state='disputed' THEN RAISE EXCEPTION 'PAYMENT_FEE_PAUSED' USING ERRCODE='23514'; END IF;
   IF state NOT IN('awaiting_approval','approved') OR p->>'statementHash' IS DISTINCT FROM st.document->>'statementHash'
   THEN RAISE EXCEPTION 'PAYMENT_FEE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
   deadline:=app.payment_fee_review_deadline(t,j,st.sources,actor);
   IF state='awaiting_approval' THEN
   INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,st.decision_id,'approved',actor);
   auth:=gen_random_uuid();
   INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,amount_pence,currency,expires_at)
    VALUES(auth,t,st.decision_id,resolution,actor,'payment_fee.collect','platform:jobguard',st.document->>'statementHash',1,'reference_fee_policy_v3',(st.document->>'feePence')::bigint,'GBP',deadline);
   END IF;
  END IF;
 END IF;
 result:=st.document;
 INSERT INTO app.payment_fee_command(tenant_id,job_id,command_id,statement_id,actor_membership_id,payload,result,authorization_id)
  VALUES(t,j,cid,st.id,actor,p,result,auth);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor::text,j,'payment_fee.'||action,
  jsonb_build_object('commandId',cid,'statementId',st.id,'statementHash',st.document->>'statementHash'));
 RETURN result;
END $$;
COMMIT;
