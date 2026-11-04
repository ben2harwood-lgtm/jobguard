BEGIN;
CREATE OR REPLACE FUNCTION app.read_success_fee_v3(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE THEN
  RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session,t);
 IF actor.membership_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor.membership_id
   AND m.identity_user_id=actor.identity_user_id AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ) THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND j.practice_session_digest=p_session
   AND j.fee_policy_version='reference_fee_policy_v3'
   AND c.job_track='small_builder' AND c.environment='synthetic_demo'
 ) THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job) THEN
  RETURN jsonb_build_object('version','success-fee-availability.v1','jobId',p_job,
   'environment','synthetic_demo','state','catch_review_available','productionEnabled',false,'realExternalActions',0);
 END IF;
 -- No shadow, attribution, allocation, evidence, review or ledger read occurs.
 RETURN jsonb_build_object('version','success-fee-availability.v1','jobId',p_job,
  'environment','synthetic_demo','state','dependency_bound',
  'dependency','accepted_attribution_source_adapter','productionEnabled',false,'realExternalActions',0);
END $$;
-- Private source fence: runtime cannot access the protected Final Check tables.
-- Called only after authentication, the final-account lock and command validation,
-- at the existing lock-order position before any case/advisory/audit head lock.
CREATE FUNCTION app.lock_success_fee_sources() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 LOCK TABLE app.recovery_attribution_revision,app.recovery_attribution_command,
 app.stored_receipt_case_allocation,app.receipt_allocation_fact_source,
 app.receipt_allocation_fact_line,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_command,
 app.customer_payment_reversal,app.customer_credit_note,app.practice_feed_event,app.practice_feed_command,
 app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,
 app.recovery_case,app.recovery_claim_revision,app.recovery_case_event IN SHARE MODE;
END $$;
ALTER FUNCTION app.lock_success_fee_sources() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_success_fee_sources() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

-- Latest body: 0302. Preserve its authentication call and closed Q2/Q3 boundary;
-- add only synthetic, exact-statement catch review/approval and local posting.
CREATE OR REPLACE FUNCTION app.write_success_fee_v3(p_job uuid,p_session text,p_command jsonb,p_artifact jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record; c record; a record; approval app.action_authorization;
 prior app.success_fee_command; saved app.success_fee_review; live jsonb; selection jsonb;
 sources jsonb:='[]'; parts jsonb:='[]'; statement jsonb; result jsonb; pair numeric[];
 posting_revision integer; posted bigint; fee bigint; delta bigint; deadline timestamptz; source_deadline timestamptz;
 cid uuid; rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); jid uuid;
 decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid();
 digest text; action text:=p_command->>'action';
BEGIN
 PERFORM app.read_success_fee_v3(p_job,p_session);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 -- Pre-lock paths remain independent of every hidden source.
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job)
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF p_artifact IS NOT NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
 OR p_command->>'version' IS DISTINCT FROM 'success-fee-command.v1'
 OR action IS NULL OR action NOT IN('review','approve')
 OR NOT(p_command ?& ARRAY['version','commandId','action','expectedPostingRevision'])
 OR jsonb_typeof(p_command->'expectedPostingRevision') IS DISTINCT FROM 'number'
 OR coalesce(p_command->>'expectedPostingRevision','') !~ '^(0|[1-9][0-9]*)$'
 OR (p_command->>'expectedPostingRevision')::numeric>2147483646
 OR NOT coalesce(pg_input_is_valid(p_command->>'commandId','uuid'),false)
 OR (action='review' AND p_command-ARRAY['version','commandId','action','expectedPostingRevision']<>'{}')
 OR (action='approve' AND (NOT(p_command ?& ARRAY['reviewId','statementHash'])
  OR NOT coalesce(pg_input_is_valid(p_command->>'reviewId','uuid'),false)
  OR coalesce(p_command->>'statementHash','') !~ '^[a-f0-9]{64}$'
  OR p_command-ARRAY['version','commandId','action','expectedPostingRevision','reviewId','statementHash']<>'{}'))
 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- Coarse synthetic-only source fence: these SHARE locks exclude INSERT as
 -- well as UPDATE, so a new refund/invalidation/disclosure cannot be a phantom.
 -- Acquire before business row/advisory locks, never after the audit head.
 -- Contending source writers may deadlock and must retry their whole command;
 -- no stale source can commit as qualifying proof. No production throughput claim.
 LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;
 PERFORM app.lock_success_fee_sources();
 FOR c IN SELECT id FROM app.recovery_case WHERE tenant_id=t AND job_id=p_job ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c.id::text));
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||p_job::text,0));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,true);
 PERFORM pg_advisory_xact_lock(hashtextextended('success-fee-command:'||t::text||':'||cid::text,0));
 PERFORM app.read_success_fee_v3(p_job,p_session);
 SELECT * INTO prior FROM app.success_fee_command WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.job_id<>p_job OR prior.actor_membership_id<>actor.member_id OR prior.payload<>p_command
  THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT coalesce(max(revision),0) INTO posting_revision FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=p_job;
 SELECT coalesce(sum(amount_pence),0) INTO posted FROM app.success_fee_journal WHERE tenant_id=t AND job_id=p_job;
 IF posting_revision<>(p_command->>'expectedPostingRevision')::integer
 THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
 FOR a IN SELECT DISTINCT ON(case_id,work_id,line_id,lock_id) * FROM app.recovery_attribution_revision
  WHERE tenant_id=t AND job_id=p_job ORDER BY case_id,work_id,line_id,lock_id,revision DESC LOOP
  SELECT auth.* INTO approval FROM app.recovery_attribution_command cmd
   JOIN app.action_authorization auth ON auth.tenant_id=cmd.tenant_id AND auth.id::text=cmd.first_result->>'reviewAuthorizationId'
   JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(auth.tenant_id,auth.resolution_id,auth.decision_id)
   JOIN app.decision dec ON(dec.tenant_id,dec.id)=(auth.tenant_id,auth.decision_id)
   WHERE cmd.tenant_id=t AND cmd.job_id=p_job AND cmd.assessment_id=a.id AND cmd.payload->>'action'='approve_review'
    AND auth.action_type='recovery.attribution_review' AND auth.recipient=a.id::text
    AND auth.content_hash=app.final_lock_hash(a.document) AND auth.aggregate_revision=a.revision
    AND auth.policy_version=a.document->>'eligibilityPolicyVersion'
    AND auth.actor_membership_id=cmd.actor_membership_id AND dr.actor_membership_id=cmd.actor_membership_id
    AND dec.subject_type='recovery_attribution' AND dec.subject_ref=a.id::text AND dec.action_type=auth.action_type
    AND dr.resolution='approved' AND auth.revoked_at IS NULL AND auth.expires_at>clock_timestamp();
  IF approval.id IS NULL THEN RAISE EXCEPTION 'SUCCESS_FEE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  source_deadline:=least(source_deadline,approval.expires_at);
  selection:=jsonb_build_object('caseId',a.case_id,'workId',a.work_id,'lineId',a.line_id,'lockId',a.lock_id);
  BEGIN
   live:=app.recovery_attribution_sources(t,p_job,selection,actor.member_id);
  EXCEPTION WHEN check_violation THEN
   RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
  END;
  IF live->>'sourceHash' IS DISTINCT FROM a.source_hash
   OR a.document->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR live->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR live->'reasonCodes' IS DISTINCT FROM '[]'::jsonb OR a.document->'reasonCodes' IS DISTINCT FROM '[]'::jsonb
   OR (SELECT count(*) FROM jsonb_each(a.document->'facts'->'facts'))<>10
   OR EXISTS(SELECT 1 FROM jsonb_each(a.document->'facts'->'facts') f WHERE f.value->'holds' IS DISTINCT FROM 'true'::jsonb)
   OR live->'remainingPrincipal' IS DISTINCT FROM a.document->'remainingPrincipal'
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  IF jsonb_array_length(sources)>=10000 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
  parts:=parts||jsonb_build_array(jsonb_build_array(live->'remainingPrincipal'->>'numerator',live->'remainingPrincipal'->>'denominator'));
  sources:=sources||jsonb_build_array(jsonb_build_object('assessmentId',a.id,'sourceHash',a.source_hash,
   'reviewAuthorizationId',approval.id,'allocationIds',(SELECT jsonb_agg(x.id ORDER BY x.id) FROM app.stored_receipt_case_allocation x
    WHERE x.tenant_id=t AND x.job_id=p_job AND (x.case_id,x.work_id,x.line_id,x.lock_id)=(a.case_id,a.work_id,a.line_id,a.lock_id))));
 END LOOP;
 IF sources='[]'::jsonb THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 pair:=app.recovery_allocation_fraction_sum(parts);
 fee:=app.ef_round_half_even(pair[1],pair[2]*10); delta:=fee-posted;
 IF delta<0 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF fee>1000000000000 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 statement:=jsonb_build_object('version','success-fee-statement.v1','jobId',p_job,'policyVersion','reference_fee_policy_v3',
  'roundingPolicy','commercial_half_even.v1','qualifyingPrincipal',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text),
  'feePence',fee,'priorPence',posted,'deltaPence',delta,'expectedPostingRevision',posting_revision,'sources',sources,
  'environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
 digest:=app.final_lock_hash(statement);
 SELECT least(s.expires_at,m.expires_at,source_deadline) INTO deadline FROM control_plane.practice_session s
  JOIN app.membership m ON m.tenant_id=t AND m.id=actor.member_id WHERE s.token_digest=p_session;
 IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF action='review' THEN
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'success_fee',rid::text,'success_fee.post');
  INSERT INTO app.success_fee_review(tenant_id,job_id,id,command_id,statement,statement_hash,expected_revision,decision_id,actor_membership_id,expires_at)
   VALUES(t,p_job,rid,cid,statement,digest,posting_revision,decision,actor.member_id,deadline);
 ELSE
  SELECT * INTO saved FROM app.success_fee_review WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'reviewId')::uuid;
  IF saved.id IS NULL OR saved.actor_membership_id<>actor.member_id OR saved.expires_at<=clock_timestamp()
   OR saved.expected_revision<>posting_revision OR saved.statement IS DISTINCT FROM statement
   OR saved.statement_hash<>digest OR digest<>p_command->>'statementHash'
   OR EXISTS(SELECT 1 FROM app.decision_resolution r WHERE r.tenant_id=t AND r.decision_id=saved.decision_id)
  THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  rid:=saved.id; decision:=saved.decision_id;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,decision,'approved',actor.member_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,amount_pence,currency,aggregate_revision,policy_version,expires_at)
   VALUES(auth_id,t,decision,resolution,actor.member_id,'success_fee.post','jobguard:synthetic_fee_ledger',digest,delta,'GBP',posting_revision,'reference_fee_policy_v3',least(deadline,saved.expires_at));
  INSERT INTO app.success_fee_derivation(tenant_id,job_id,id,review_id,revision,authorization_id,qualifying_numerator,qualifying_denominator,fee_pence,prior_pence,delta_pence,statement_hash)
   VALUES(t,p_job,did,rid,posting_revision+1,auth_id,trunc(pair[1])::text,trunc(pair[2])::text,fee,posted,delta,digest);
  INSERT INTO app.success_fee_source(tenant_id,job_id,derivation_id,assessment_id,allocation_id,review_authorization_id,case_id,work_id,line_id,lock_id)
   SELECT t,p_job,did,(s->>'assessmentId')::uuid,x::uuid,(s->>'reviewAuthorizationId')::uuid,ar.case_id,ar.work_id,ar.line_id,ar.lock_id
   FROM jsonb_array_elements(sources) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'allocationIds') x
   JOIN app.recovery_attribution_revision ar ON ar.tenant_id=t AND ar.id=(s->>'assessmentId')::uuid;
  IF delta>0 THEN
   jid:=gen_random_uuid();
   INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency) VALUES(t,p_job,jid,did,delta,'GBP');
   INSERT INTO app.success_fee_journal_line(tenant_id,job_id,journal_id,account,side,amount_pence)
    VALUES(t,p_job,jid,'fee_receivable','debit',delta),(t,p_job,jid,'fee_income','credit',delta);
  END IF;
 END IF;
 result:=jsonb_build_object('version','success-fee-result.v1','jobId',p_job,'commandId',cid,'action',action,'reviewId',rid,
  'statementHash',digest,'statement',statement,'derivationId',CASE WHEN action='approve' THEN did END,'journalId',jid,
  'postingRevision',posting_revision+(CASE WHEN action='approve' THEN 1 ELSE 0 END),'replayed',false,
  'environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
 INSERT INTO app.success_fee_command(tenant_id,job_id,command_id,actor_membership_id,payload,result) VALUES(t,p_job,cid,actor.member_id,p_command,result);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'success_fee.'||action,
  jsonb_build_object('commandId',cid,'reviewId',rid,'statementHash',digest,'derivationId',CASE WHEN action='approve' THEN did END,'journalId',jid));
 RETURN result;
EXCEPTION WHEN deadlock_detected THEN
 RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
END $$;
COMMIT;
