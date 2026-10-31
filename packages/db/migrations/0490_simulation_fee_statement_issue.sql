BEGIN;
-- M4-10-S: separate success-fee documents in the app.platform_* document namespace.
-- Subscription periods, amounts and latest 0374 routines remain unchanged.
CREATE TABLE app.platform_fee_statement (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0), namespace text NOT NULL CHECK(namespace='success_fee.synthetic.v1'),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL, document_hash text NOT NULL CHECK(document_hash=app.final_lock_hash(document)),
 original_id uuid, decision_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,sequence), UNIQUE(tenant_id,job_id,source_hash),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,original_id) REFERENCES app.platform_fee_statement(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
 CHECK(document->>'statementId'=id::text AND document->>'jobId'=job_id::text
  AND document->>'namespace'=namespace AND document->>'number'='DEMO-FEE-'||lpad(sequence::text,greatest(6,length(sequence::text)),'0'))
);
CREATE TABLE app.platform_fee_statement_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 payload jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['platform_fee_statement','platform_fee_statement_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY success_fee_tenant ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END) WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER success_fee_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
-- Private source loader: consumes M4-9-S approved derivations and SV-6's current
-- source validator, never supplied amounts or a new allocation implementation.
CREATE FUNCTION app.platform_fee_statement_sources(t uuid,j uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE latest app.success_fee_derivation; saved app.success_fee_review; source jsonb; live jsonb; assessment app.recovery_attribution_revision;
 parts jsonb:='[]'; sources jsonb:='[]'; derivations jsonb; pair numeric[]; fee bigint;
BEGIN
 SELECT * INTO latest FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 IF latest.id IS NULL THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF EXISTS(SELECT 1 FROM app.success_fee_derivation d JOIN app.action_authorization a ON(a.tenant_id,a.id)=(d.tenant_id,d.authorization_id) WHERE d.tenant_id=t AND d.job_id=j AND (a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp()))
 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT * INTO saved FROM app.success_fee_review WHERE tenant_id=t AND job_id=j AND id=latest.review_id;
 FOR source IN SELECT value FROM jsonb_array_elements(saved.statement->'sources') LOOP
  IF NOT EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=t AND a.id=(source->>'reviewAuthorizationId')::uuid AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp())
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  SELECT * INTO assessment FROM app.recovery_attribution_revision WHERE tenant_id=t AND job_id=j AND id=(source->>'assessmentId')::uuid;
  BEGIN
  live:=app.recovery_attribution_sources(t,j,jsonb_build_object('caseId',assessment.case_id,'workId',assessment.work_id,'lineId',assessment.line_id,'lockId',assessment.lock_id),actor);
  EXCEPTION WHEN check_violation THEN
   RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
  END;
  -- Lost proof is recorded as lost eligibility, never silently retained as positive principal.
  IF live->'reasonCodes'<>'[]'::jsonb THEN live:=jsonb_set(live,'{remainingPrincipal}',jsonb_build_object('numerator','0','denominator','1')); END IF;
  parts:=parts||jsonb_build_array(jsonb_build_array(live->'remainingPrincipal'->>'numerator',live->'remainingPrincipal'->>'denominator'));
  sources:=sources||jsonb_build_array(jsonb_build_object('assessmentId',assessment.id,'currentAssessmentId',live->>'previousAssessmentId','sourceHash',live->>'sourceHash',
   'reviewAuthorizationId',source->>'reviewAuthorizationId','allocationIds',
   (SELECT jsonb_agg(a.id ORDER BY a.id) FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j
     AND (a.case_id,a.work_id,a.line_id,a.lock_id)=(assessment.case_id,assessment.work_id,assessment.line_id,assessment.lock_id)),
   'remainingPrincipal',live->'remainingPrincipal','reasonCodes',live->'reasonCodes'));
 END LOOP;
 pair:=app.recovery_allocation_fraction_sum(parts); fee:=app.ef_round_half_even(pair[1],pair[2]*10);
 -- A statement cannot expand the posted entitlement or substitute a new positive source.
 IF fee>latest.fee_pence THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT jsonb_agg(jsonb_build_object('derivationId',d.id,'reviewId',d.review_id,'authorizationId',d.authorization_id,'statementHash',d.statement_hash) ORDER BY d.revision)
 INTO derivations FROM app.success_fee_derivation d WHERE d.tenant_id=t AND d.job_id=j;
 RETURN jsonb_build_object('postingRevision',latest.revision,'qualifyingPrincipal',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text),
  'feePence',fee,'sources',sources,'derivations',derivations,
  'adjustments',jsonb_build_object(
   'paymentReversalIds',(SELECT coalesce(jsonb_agg(r.id ORDER BY r.id),'[]') FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.job_id=j),
   'creditNoteIds',(SELECT coalesce(jsonb_agg(c.id ORDER BY c.id),'[]') FROM app.customer_credit_note c WHERE c.tenant_id=t AND c.job_id=j),
   'evidenceInvalidationIds',(SELECT coalesce(jsonb_agg(i.id ORDER BY i.id),'[]') FROM app.evidence_invalidation i JOIN app.evidence_object e ON(e.tenant_id,e.id)=(i.tenant_id,i.evidence_id) WHERE e.tenant_id=t AND e.job_id=j)));

END $$;
CREATE FUNCTION app.read_platform_fee_statements(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; documents jsonb:='[]'; availability jsonb;
BEGIN
 availability:=app.read_success_fee_v3(p_job,p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 -- Before lock, even existing hidden rows must not influence the response.
 IF availability->>'state'='catch_review_available' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('document',document,'documentHash',document_hash) ORDER BY sequence),'[]')
  INTO documents FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job;
 END IF;
 RETURN jsonb_build_object('version','simulation-fee-statement-view.v1','jobId',p_job,'statements',documents);
END $$;
CREATE FUNCTION app.write_platform_fee_statement(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE t uuid; actor record; c record; action text:=p_command->>'action'; cid uuid;
 prior app.platform_fee_statement_command; existing app.platform_fee_statement; previous app.platform_fee_statement;
 snapshot jsonb; v_source_hash text; document jsonb; history jsonb; digest text; result jsonb;
 sid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); auth_id uuid;
 sequence integer; amount bigint; deadline timestamptz; approval_action text;
BEGIN
 PERFORM app.read_success_fee_v3(p_job,p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job)
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM 'simulation-fee-statement-command.v1'
 OR action IS NULL OR action NOT IN('issue','approve') OR NOT(p_command ?& ARRAY['version','action','commandId'])
 OR NOT coalesce(pg_input_is_valid(p_command->>'commandId','uuid'),false)
 OR (action='issue' AND p_command-ARRAY['version','action','commandId']<>'{}')
 OR (action='approve' AND (NOT(p_command ?& ARRAY['statementId','statementHash'])
  OR NOT coalesce(pg_input_is_valid(p_command->>'statementId','uuid'),false) OR coalesce(p_command->>'statementHash','') !~ '^[a-f0-9]{64}$'
  OR p_command-ARRAY['version','action','commandId','statementId','statementHash']<>'{}'))
 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- Reuse the catch posting writer's private source fence; acquire business locks before audit.
 LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;
 PERFORM app.lock_success_fee_sources();
 FOR c IN SELECT id FROM app.recovery_case WHERE tenant_id=t AND job_id=p_job ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c.id::text));
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||p_job::text,0));
 -- Tenant scope reserves numbers across jobs and serializes command replay identities.
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-fee-statement:'||t::text,0));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,true);
 PERFORM app.read_success_fee_v3(p_job,p_session);
 SELECT * INTO prior FROM app.platform_fee_statement_command WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.job_id<>p_job OR prior.actor_membership_id<>actor.member_id OR prior.payload<>p_command
  THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 snapshot:=app.platform_fee_statement_sources(t,p_job,actor.member_id); v_source_hash:=app.final_lock_hash(snapshot);
 SELECT s.* INTO previous FROM app.platform_fee_statement s WHERE s.tenant_id=t AND s.job_id=p_job ORDER BY s.sequence DESC LIMIT 1;
 IF action='issue' THEN
  SELECT s.* INTO existing FROM app.platform_fee_statement s WHERE s.tenant_id=t AND s.job_id=p_job AND s.source_hash=v_source_hash;
  IF existing.id IS NULL THEN
   SELECT coalesce(max(s.sequence),0)+1 INTO sequence FROM app.platform_fee_statement s WHERE s.tenant_id=t;
   amount:=(snapshot->>'feePence')::bigint-coalesce((previous.document->'cumulativeFeePrincipal'->>'pence')::bigint,0);
   SELECT coalesce(jsonb_agg(jsonb_build_object('journalId',journal.id,'principal',jsonb_build_object('pence',amount_pence,'currency','GBP')) ORDER BY d.revision),'[]')
   INTO history FROM app.success_fee_journal journal JOIN app.success_fee_derivation d ON(d.tenant_id,d.job_id,d.id)=(journal.tenant_id,journal.job_id,journal.derivation_id)
   WHERE journal.tenant_id=t AND journal.job_id=p_job;
   document:=jsonb_build_object('version','issued-simulation-fee-statement.v1','statementId',sid,'jobId',p_job,
    'number','DEMO-FEE-'||lpad(sequence::text,greatest(6,length(sequence::text)),'0'),'namespace','success_fee.synthetic.v1',
    'environment','synthetic_demo','policyVersion','reference_fee_policy_v3','qualifyingPrincipal',snapshot->'qualifyingPrincipal',
    'cumulativeFeePrincipal',jsonb_build_object('pence',(snapshot->>'feePence')::bigint,'currency','GBP'),
    'documentPrincipal',jsonb_build_object('pence',amount,'currency','GBP'),'postingHistory',history,'sourceSnapshot',snapshot,
    'original',CASE WHEN previous.id IS NOT NULL THEN jsonb_build_object('statementId',previous.id,'documentHash',previous.document_hash) ELSE 'null'::jsonb END,
    'settlementHistory',jsonb_build_object('state','integration_unavailable','dependency','M4-12-S'),
    'warning','Simulation statement — proposed policy, principal only; not a tax invoice or real amount due',
    'vatLabel','VAT not calculated','sandboxLabel','Practice sandbox — synthetic data; nothing is sent or charged');
   digest:=app.final_lock_hash(document);
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'simulation_fee_statement',sid::text,CASE WHEN amount<0 THEN 'success_fee.statement_correction_approve' ELSE 'success_fee.statement_approve' END);
   INSERT INTO app.platform_fee_statement(tenant_id,job_id,id,sequence,namespace,source_hash,document,document_hash,original_id,decision_id)
    VALUES(t,p_job,sid,sequence,'success_fee.synthetic.v1',v_source_hash,document,digest,previous.id,decision);
  ELSE sid:=existing.id; digest:=existing.document_hash;
  END IF;
 ELSE
  SELECT s.* INTO existing FROM app.platform_fee_statement s WHERE s.tenant_id=t AND s.job_id=p_job AND s.id=(p_command->>'statementId')::uuid;
  IF existing.id IS NULL OR existing.id IS DISTINCT FROM previous.id OR existing.document_hash IS DISTINCT FROM p_command->>'statementHash'
   OR existing.source_hash IS DISTINCT FROM v_source_hash
  THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  sid:=existing.id; digest:=existing.document_hash;
  amount:=(existing.document->'documentPrincipal'->>'pence')::bigint;
  -- Action identity records direction without weakening the shared nonnegative amount invariant.
  approval_action:=CASE WHEN amount<0 THEN 'success_fee.statement_correction_approve' ELSE 'success_fee.statement_approve' END;
  SELECT a.id INTO auth_id FROM app.action_authorization a
   JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
   WHERE a.tenant_id=t AND d.subject_type='simulation_fee_statement' AND d.subject_ref=sid::text
    AND a.action_type=approval_action AND a.recipient=sid::text AND a.content_hash=digest
    AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp();
  IF auth_id IS NULL THEN
   decision:=existing.decision_id;
   IF EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=decision) THEN
    -- Preserve the original Decision and expired authorization; renewal is a new explicit approval.
    decision:=gen_random_uuid();
    INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
     VALUES(decision,t,'simulation_fee_statement',sid::text,approval_action);
   END IF;
   SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s JOIN app.membership m ON m.tenant_id=t AND m.id=actor.member_id WHERE s.token_digest=p_session;
   IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
   auth_id:=gen_random_uuid();
   INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,decision,'approved',actor.member_id);
   INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,amount_pence,currency,aggregate_revision,policy_version,expires_at)
    VALUES(auth_id,t,decision,resolution,actor.member_id,approval_action,sid::text,digest,
     abs(amount),'GBP',(snapshot->>'postingRevision')::integer,'reference_fee_policy_v3',deadline);
  END IF;
 END IF;
 result:=jsonb_build_object('version','simulation-fee-statement-result.v1','commandId',cid,'statementId',sid,'documentHash',digest,'authorizationId',auth_id,'replayed',false);
 INSERT INTO app.platform_fee_statement_command VALUES(t,p_job,cid,actor.member_id,p_command,result);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_fee_statement.'||action,
  jsonb_build_object('commandId',cid,'statementId',sid,'documentHash',digest,'authorizationId',auth_id));
 RETURN result;
EXCEPTION WHEN deadlock_detected THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
END $$;
ALTER FUNCTION app.platform_fee_statement_sources(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.platform_fee_statement_sources(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
ALTER FUNCTION app.read_platform_fee_statements(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_platform_fee_statements(uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.read_platform_fee_statements(uuid,text) TO jobguard_runtime;
ALTER FUNCTION app.write_platform_fee_statement(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_platform_fee_statement(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.write_platform_fee_statement(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
