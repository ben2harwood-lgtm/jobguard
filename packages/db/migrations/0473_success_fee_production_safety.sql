BEGIN;
-- M4-9 part 2, RED. Synthetic preparation only; G4-S and approved production policies remain closed.
ALTER TABLE app.success_fee_derivation DROP CONSTRAINT success_fee_derivation_delta_pence_check;
ALTER TABLE app.success_fee_derivation ADD CONSTRAINT success_fee_derivation_delta_pence_check CHECK(abs(delta_pence)<=1000000000000);
-- One negative derivation may compensate several historical positive journals.
ALTER TABLE app.success_fee_journal DROP CONSTRAINT success_fee_journal_tenant_id_derivation_id_key;
CREATE UNIQUE INDEX success_fee_journal_positive_derivation ON app.success_fee_journal(tenant_id,derivation_id) WHERE amount_pence>0;
CREATE UNIQUE INDEX success_fee_journal_compensation ON app.success_fee_journal(tenant_id,derivation_id,reverses_journal_id) WHERE amount_pence<0;
CREATE FUNCTION app.success_fee_production_command(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501';
END $$;
ALTER FUNCTION app.success_fee_production_command(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.success_fee_production_command(uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.success_fee_production_command(uuid,text,jsonb) TO jobguard_runtime;
CREATE FUNCTION app.success_fee_inputs(t uuid,j uuid,p_actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE a record; approval app.action_authorization; source_deadline timestamptz;
 live jsonb; selection jsonb; parts jsonb:='[]'; sources jsonb:='[]'; pair numeric[];
BEGIN
 FOR a IN SELECT DISTINCT ON(case_id,work_id,line_id,lock_id) * FROM app.recovery_attribution_revision
  WHERE tenant_id=t AND job_id=j ORDER BY case_id,work_id,line_id,lock_id,revision DESC LOOP
  SELECT auth.* INTO approval FROM app.recovery_attribution_command cmd
   JOIN app.action_authorization auth ON auth.tenant_id=cmd.tenant_id AND auth.id::text=cmd.first_result->>'reviewAuthorizationId'
   JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(auth.tenant_id,auth.resolution_id,auth.decision_id)
   JOIN app.decision dec ON(dec.tenant_id,dec.id)=(auth.tenant_id,auth.decision_id)
   WHERE cmd.tenant_id=t AND cmd.job_id=j AND cmd.assessment_id=a.id AND cmd.payload->>'action'='approve_review'
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
   live:=app.recovery_attribution_sources(t,j,selection,p_actor);
  EXCEPTION WHEN check_violation THEN
   RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
  END;
  IF live->>'sourceHash' IS DISTINCT FROM a.source_hash
   OR live->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR a.document->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR live->'reasonCodes' IS DISTINCT FROM '[]'::jsonb
   OR a.document->'reasonCodes' IS DISTINCT FROM '[]'::jsonb
   OR (SELECT count(*) FROM jsonb_each(a.document->'facts'->'facts'))<>10
   OR EXISTS(SELECT 1 FROM jsonb_each(a.document->'facts'->'facts') f WHERE f.value->'holds' IS DISTINCT FROM 'true'::jsonb)
   OR live->'remainingPrincipal' IS DISTINCT FROM a.document->'remainingPrincipal'
  THEN
   -- Changed proof can only REDUCE an already posted source. Never acquire a new positive entitlement.
   IF NOT EXISTS(SELECT 1 FROM app.success_fee_source s WHERE s.tenant_id=t AND s.job_id=j AND s.assessment_id=a.id)
   THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
   IF live->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review' THEN
    live:=jsonb_set(live,'{remainingPrincipal}','{"numerator":"0","denominator":"1"}'::jsonb);
   END IF;
   IF (live->'remainingPrincipal'->>'numerator')::numeric*(a.document->'remainingPrincipal'->>'denominator')::numeric
    >(a.document->'remainingPrincipal'->>'numerator')::numeric*(live->'remainingPrincipal'->>'denominator')::numeric
   THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  END IF;
  IF jsonb_array_length(sources)>=10000 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
  parts:=parts||jsonb_build_array(jsonb_build_array(live->'remainingPrincipal'->>'numerator',live->'remainingPrincipal'->>'denominator'));
  sources:=sources||jsonb_build_array(jsonb_build_object('assessmentId',a.id,'sourceHash',live->>'sourceHash',
   'reviewAuthorizationId',approval.id,'allocationIds',(SELECT jsonb_agg(x.id ORDER BY x.id) FROM app.stored_receipt_case_allocation x
    WHERE x.tenant_id=t AND x.job_id=j AND (x.case_id,x.work_id,x.line_id,x.lock_id)=(a.case_id,a.work_id,a.line_id,a.lock_id))));
 END LOOP;
 IF sources='[]'::jsonb THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 pair:=app.recovery_allocation_fraction_sum(parts);
 RETURN jsonb_build_object('sources',sources,'numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text,
  'fee',app.ef_round_half_even(pair[1],pair[2]*10),'deadline',source_deadline);
END $$;
CREATE OR REPLACE FUNCTION app.write_success_fee_v3(p_job uuid,p_session text,p_command jsonb,p_artifact jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record; c record; a record; approval app.action_authorization;
 prior app.success_fee_command; saved app.success_fee_review; live jsonb; selection jsonb;
 sources jsonb:='[]'; parts jsonb:='[]'; statement jsonb; result jsonb; pair numeric[];
 posting_revision integer; posted bigint; fee bigint; delta bigint; deadline timestamptz; source_deadline timestamptz;
 cid uuid; rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); jid uuid;
 decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid();
 inputs jsonb; original record; remaining bigint; portion bigint; compensations jsonb:='[]';
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
 LOCK TABLE app.recovery_attribution_revision,app.recovery_attribution_command,
 app.stored_receipt_case_allocation,app.receipt_allocation_fact_source,
 app.receipt_allocation_fact_line,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_command,
 app.customer_payment_reversal,app.customer_credit_note,app.practice_feed_event,app.practice_feed_command,
 app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,
 app.recovery_case,app.recovery_claim_revision,app.recovery_case_event IN SHARE MODE;
 PERFORM pg_advisory_xact_lock(hashtextextended('success-fee-job:'||t::text||':'||p_job::text,0));
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
 inputs:=app.success_fee_inputs(t,p_job,actor.member_id);
 sources:=inputs->'sources'; source_deadline:=(inputs->>'deadline')::timestamptz;
 pair:=ARRAY[(inputs->>'numerator')::numeric,(inputs->>'denominator')::numeric];
 fee:=(inputs->>'fee')::bigint; delta:=fee-posted;
 IF fee>1000000000000 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 statement:=jsonb_build_object('version','success-fee-statement.v1','jobId',p_job,'policyVersion','reference_fee_policy_v3',
  'roundingPolicy','commercial_half_even.v1','qualifyingPrincipal',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text),
  'feePence',fee,'priorPence',posted,'deltaPence',delta,'expectedPostingRevision',posting_revision,'sources',sources,
  'environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
 IF delta<0 THEN
  remaining:=-delta;
  FOR original IN SELECT x.id,x.derivation_id,x.amount_pence+coalesce((SELECT sum(y.amount_pence) FROM app.success_fee_journal y
   WHERE y.tenant_id=t AND y.job_id=p_job AND y.reverses_journal_id=x.id),0) available
   FROM app.success_fee_journal x JOIN app.success_fee_derivation d ON(d.tenant_id,d.id)=(x.tenant_id,x.derivation_id)
   WHERE x.tenant_id=t AND x.job_id=p_job AND x.amount_pence>0 ORDER BY d.revision,x.id LOOP
   portion:=least(remaining,original.available); IF portion<=0 THEN CONTINUE; END IF;
   compensations:=compensations||jsonb_build_array(jsonb_build_object('journalId',original.id,'derivationId',original.derivation_id,'amountPence',portion));
   remaining:=remaining-portion; EXIT WHEN remaining=0;
  END LOOP;
  IF remaining<>0 THEN RAISE EXCEPTION 'SUCCESS_FEE_JOURNAL_INVALID' USING ERRCODE='23514'; END IF;
  statement:=statement||jsonb_build_object('compensatesDerivationId',compensations->0->>'derivationId','compensations',compensations);
 END IF;
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
   VALUES(auth_id,t,decision,resolution,actor.member_id,'success_fee.post','jobguard:synthetic_fee_ledger',digest,abs(delta),'GBP',posting_revision,'reference_fee_policy_v3',least(deadline,saved.expires_at));
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
  ELSIF delta<0 THEN
   FOR original IN SELECT * FROM jsonb_to_recordset(compensations) AS x("journalId" uuid,"derivationId" uuid,"amountPence" bigint) LOOP
    portion:=original."amountPence"; jid:=gen_random_uuid();
    INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency,reverses_journal_id)
     VALUES(t,p_job,jid,did,-portion,'GBP',original."journalId");
    INSERT INTO app.success_fee_journal_line(tenant_id,job_id,journal_id,account,side,amount_pence)
     VALUES(t,p_job,jid,'fee_receivable','credit',portion),(t,p_job,jid,'fee_income','debit',portion);
   END LOOP;
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
CREATE OR REPLACE FUNCTION app.check_success_fee_journal() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=NEW.tenant_id; j uuid; n bigint; debit numeric; credit numeric; lines integer;
BEGIN
 j:=NEW.id;
 SELECT amount_pence INTO n FROM app.success_fee_journal WHERE tenant_id=t AND id=j;
 SELECT count(*),sum(amount_pence) FILTER(WHERE side='debit'),sum(amount_pence) FILTER(WHERE side='credit')
 INTO lines,debit,credit FROM app.success_fee_journal_line WHERE tenant_id=t AND journal_id=j;
 IF lines<>2 OR debit IS DISTINCT FROM abs(n)::numeric OR credit IS DISTINCT FROM abs(n)::numeric
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_journal_line l WHERE l.tenant_id=t AND l.journal_id=j AND l.account='fee_receivable' AND l.side=(CASE WHEN n>0 THEN 'debit' ELSE 'credit' END))
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_derivation d WHERE d.tenant_id=t AND d.id=NEW.derivation_id AND d.job_id=NEW.job_id AND sign(d.delta_pence)=sign(n))
 THEN RAISE EXCEPTION 'SUCCESS_FEE_JOURNAL_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.check_success_fee_derivation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n integer; amount numeric; inputs jsonb; saved app.success_fee_review; prior bigint; stored jsonb; compensations jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.fee_policy_version='reference_fee_policy_v3'
   AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO saved FROM app.success_fee_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.review_id;
 inputs:=app.success_fee_inputs(NEW.tenant_id,NEW.job_id,saved.actor_membership_id);
 SELECT coalesce(sum(j.amount_pence),0) INTO prior FROM app.success_fee_journal j JOIN app.success_fee_derivation d
  ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id) WHERE j.tenant_id=NEW.tenant_id AND j.job_id=NEW.job_id AND d.revision<NEW.revision;
 SELECT coalesce(jsonb_agg(jsonb_build_object('assessmentId',s.assessment_id,'allocationId',s.allocation_id,'reviewAuthorizationId',s.review_authorization_id) ORDER BY s.assessment_id,s.allocation_id),'[]')
 INTO stored FROM app.success_fee_source s WHERE s.tenant_id=NEW.tenant_id AND s.job_id=NEW.job_id AND s.derivation_id=NEW.id;
 -- Reconstruct links from the actual cancelled journals, never a convenient latest derivation.
 SELECT coalesce(jsonb_agg(jsonb_build_object('journalId',original.id,'derivationId',original.derivation_id,'amountPence',-credit.amount_pence)
  ORDER BY d.revision,original.id),'[]') INTO compensations
 FROM app.success_fee_journal credit
 JOIN app.success_fee_journal original ON(original.tenant_id,original.job_id,original.id)=(credit.tenant_id,credit.job_id,credit.reverses_journal_id)
 JOIN app.success_fee_derivation d ON(d.tenant_id,d.job_id,d.id)=(original.tenant_id,original.job_id,original.derivation_id)
 WHERE credit.tenant_id=NEW.tenant_id AND credit.job_id=NEW.job_id AND credit.derivation_id=NEW.id
  AND credit.amount_pence<0 AND original.amount_pence>0 AND d.revision<NEW.revision;
 IF inputs->'sources' IS DISTINCT FROM saved.statement->'sources'
 OR stored IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('assessmentId',s->>'assessmentId','allocationId',x,'reviewAuthorizationId',s->>'reviewAuthorizationId') ORDER BY s->>'assessmentId',x)
  FROM jsonb_array_elements(inputs->'sources') s CROSS JOIN LATERAL jsonb_array_elements_text(s->'allocationIds') x)
 OR NEW.qualifying_numerator IS DISTINCT FROM inputs->>'numerator' OR NEW.qualifying_denominator IS DISTINCT FROM inputs->>'denominator'
 OR NEW.fee_pence IS DISTINCT FROM (inputs->>'fee')::bigint OR NEW.prior_pence<>prior
 OR NEW.statement_hash<>app.final_lock_hash(saved.statement) OR NEW.statement_hash<>saved.statement_hash
 OR saved.statement->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('numerator',NEW.qualifying_numerator,'denominator',NEW.qualifying_denominator)
 OR saved.statement->>'jobId' IS DISTINCT FROM NEW.job_id::text
 OR saved.statement->>'policyVersion' IS DISTINCT FROM 'reference_fee_policy_v3'
 OR saved.statement->>'environment' IS DISTINCT FROM 'synthetic_demo'
 OR saved.statement->>'version' IS DISTINCT FROM 'success-fee-statement.v1'
 OR saved.statement->>'roundingPolicy' IS DISTINCT FROM 'commercial_half_even.v1'
 OR saved.statement->'productionEnabled' IS DISTINCT FROM 'false'::jsonb
 OR saved.statement->'realExternalActions' IS DISTINCT FROM '0'::jsonb
 OR (saved.statement->>'expectedPostingRevision')::integer IS DISTINCT FROM NEW.revision-1
 OR (NEW.delta_pence<0 AND (saved.statement->>'compensatesDerivationId' IS DISTINCT FROM saved.statement->'compensations'->0->>'derivationId'
  OR saved.statement->'compensations' IS DISTINCT FROM compensations))
 OR (NEW.delta_pence>=0 AND saved.statement ?| ARRAY['compensatesDerivationId','compensations'])
 OR saved.expected_revision<>NEW.revision-1 OR saved.expires_at<=clock_timestamp()
 OR (saved.statement->>'feePence')::bigint IS DISTINCT FROM NEW.fee_pence
 OR (saved.statement->>'priorPence')::bigint IS DISTINCT FROM NEW.prior_pence
 OR (saved.statement->>'deltaPence')::bigint IS DISTINCT FROM NEW.delta_pence
 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT count(*),coalesce(sum(amount_pence),0) INTO n,amount FROM app.success_fee_journal
  WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND derivation_id=NEW.id;
 IF NEW.fee_pence<>app.ef_round_half_even(NEW.qualifying_numerator::numeric,NEW.qualifying_denominator::numeric*10)
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND derivation_id=NEW.id)
 OR (NEW.delta_pence=0 AND n<>0) OR (NEW.delta_pence<>0 AND n=0) OR amount<>NEW.delta_pence
 OR NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution r
  ON(r.tenant_id,r.id,r.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  JOIN app.decision dec ON(dec.tenant_id,dec.id)=(a.tenant_id,a.decision_id)
  WHERE dec.subject_type='success_fee' AND dec.subject_ref=saved.id::text AND dec.action_type='success_fee.post'
   AND a.tenant_id=NEW.tenant_id AND a.id=NEW.authorization_id AND a.action_type='success_fee.post'
   AND a.content_hash=NEW.statement_hash AND a.amount_pence=abs(NEW.delta_pence) AND a.currency='GBP'
   AND a.aggregate_revision=NEW.revision-1 AND a.policy_version='reference_fee_policy_v3' AND r.resolution='approved' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
   AND a.actor_membership_id=saved.actor_membership_id AND r.actor_membership_id=saved.actor_membership_id
   AND a.decision_id=saved.decision_id AND a.recipient='jobguard:synthetic_fee_ledger')
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DERIVATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.success_fee_posting_integrity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE d app.success_fee_derivation; net bigint; available bigint;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('success-fee-job:'||NEW.tenant_id::text||':'||NEW.job_id::text,0));
 SELECT * INTO d FROM app.success_fee_derivation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.derivation_id;
 SELECT coalesce(sum(amount_pence),0) INTO net FROM app.success_fee_journal WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
 IF d.id IS NULL OR (NEW.amount_pence>0 AND NEW.amount_pence>d.fee_pence-net)
 OR (NEW.amount_pence<0 AND -NEW.amount_pence>net-d.fee_pence)
 THEN RAISE EXCEPTION 'SUCCESS_FEE_JOURNAL_INVALID' USING ERRCODE='23514'; END IF;
 IF NEW.amount_pence<0 THEN
  SELECT x.amount_pence+coalesce((SELECT sum(y.amount_pence) FROM app.success_fee_journal y
   WHERE y.tenant_id=NEW.tenant_id AND y.job_id=NEW.job_id AND y.reverses_journal_id=x.id),0) INTO available
   FROM app.success_fee_journal x WHERE x.tenant_id=NEW.tenant_id AND x.job_id=NEW.job_id AND x.id=NEW.reverses_journal_id AND x.amount_pence>0;
  IF available IS NULL OR -NEW.amount_pence>available THEN RAISE EXCEPTION 'SUCCESS_FEE_JOURNAL_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER success_fee_posting_integrity BEFORE INSERT ON app.success_fee_journal FOR EACH ROW EXECUTE FUNCTION app.success_fee_posting_integrity();
ALTER FUNCTION app.success_fee_inputs(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.success_fee_inputs(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
ALTER FUNCTION app.success_fee_posting_integrity() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.success_fee_posting_integrity() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
