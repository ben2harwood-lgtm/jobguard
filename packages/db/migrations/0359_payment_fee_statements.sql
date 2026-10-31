BEGIN;
-- MON-4A: receipt statements/approvals only. No journal, collection or provider.
CREATE TABLE app.payment_fee_statement (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, payment_id uuid NOT NULL,
 document jsonb NOT NULL, sources jsonb NOT NULL, prior_statements jsonb NOT NULL,
 decision_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), CONSTRAINT pf_stmt_job UNIQUE(tenant_id,job_id,id), CONSTRAINT pf_stmt_receipt UNIQUE(tenant_id,job_id,payment_id),
 FOREIGN KEY(tenant_id,job_id,payment_id) REFERENCES app.customer_payment(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.payment_fee_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 statement_id uuid NOT NULL, actor_membership_id uuid NOT NULL, payload jsonb NOT NULL,
 result jsonb NOT NULL, authorization_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,statement_id) REFERENCES app.payment_fee_statement(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['payment_fee_statement','payment_fee_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY payment_fee_tenant ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER payment_fee_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

-- Reuse the real SV-6 resolver and M4-8-S allocations. No money from the app.
-- Refuse adjustments until SV-6 has assessed the changed proof; an existing
-- statement is then stale and cannot authorize collection. History is retained.
CREATE FUNCTION app.payment_fee_receipt_sources(t uuid,j uuid,payment uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE a record; latest app.recovery_attribution_revision; first_proof app.recovery_attribution_revision; live jsonb;
 items jsonb:='[]'; parts jsonb:='[]'; pair numeric[]; allocated numeric[]; received bigint;
BEGIN
 SELECT amount_pence INTO received FROM app.customer_payment WHERE tenant_id=t AND job_id=j AND id=payment;
 IF received IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT x.*,s.id source_id,s.movement_id,s.movement_hash FROM app.stored_receipt_case_allocation x
  JOIN app.receipt_allocation_fact_line l ON(l.tenant_id,l.job_id,l.id)=(x.tenant_id,x.job_id,x.fact_line_id)
  JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
  WHERE x.tenant_id=t AND x.job_id=j AND s.payment_id=payment AND x.reverses_id IS NULL ORDER BY x.id LOOP
  SELECT * INTO latest FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j
   AND (r.case_id,r.work_id,r.line_id,r.lock_id)=(a.case_id,a.work_id,a.line_id,a.lock_id) ORDER BY revision DESC LIMIT 1;
  IF latest.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_ATTRIBUTION_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.recovery_case_event e WHERE e.tenant_id=t AND e.job_id=j AND e.case_id=a.case_id AND e.event_type='dispute'
   AND NOT EXISTS(SELECT 1 FROM app.recovery_case_event later WHERE later.tenant_id=t AND later.job_id=j AND later.case_id=e.case_id
    AND later.sequence>e.sequence AND later.event_type IN('resume_pursuit','close_recovered','close_no_recovery')))
   OR EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation x WHERE x.tenant_id=t AND x.job_id=j AND x.reverses_id=a.id)
  THEN RAISE EXCEPTION 'PAYMENT_FEE_PAUSED' USING ERRCODE='23514'; END IF;
  live:=app.recovery_attribution_sources(t,j,jsonb_build_object('caseId',a.case_id,'workId',a.work_id,'lineId',a.line_id,'lockId',a.lock_id),actor);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(live->'facts'->'exclusions') e WHERE e->>'reason'='attribution_disputed')
  THEN RAISE EXCEPTION 'PAYMENT_FEE_PAUSED' USING ERRCODE='23514'; END IF;
  IF live->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review' OR latest.document->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR live->>'sourceHash' IS DISTINCT FROM latest.source_hash
  THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
  SELECT app.recovery_allocation_fraction_sum(jsonb_agg(jsonb_build_array(x.net_numerator,x.net_denominator))) INTO allocated
   FROM app.stored_receipt_case_allocation x WHERE x.tenant_id=t AND x.job_id=j
    AND (x.case_id,x.work_id,x.line_id,x.lock_id)=(a.case_id,a.work_id,a.line_id,a.lock_id);
  IF allocated[1]*(live->'remainingPrincipal'->>'denominator')::numeric
   IS DISTINCT FROM allocated[2]*(live->'remainingPrincipal'->>'numerator')::numeric
  THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
  -- The resolver verifies #346 job, #356 line limits and #368 supplementary
  -- ancestry/variation REVISION identity on every prepare and approval.
  parts:=parts||jsonb_build_array(jsonb_build_array(a.net_numerator,a.net_denominator));
  -- Pin the first eligible stored revision covering this allocation. A later
  -- receipt on the same line creates a new assessment but does not rewrite
  -- this receipt's contribution. Latest live eligibility was checked above.
  SELECT * INTO first_proof FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j
   AND (r.case_id,r.work_id,r.line_id,r.lock_id)=(a.case_id,a.work_id,a.line_id,a.lock_id)
   AND r.document->>'assessmentOutcome'='eligible_for_review'
   AND r.document->'sourceManifest' @> jsonb_build_array(jsonb_build_object('kind','line_allocation','sourceId',a.id)) ORDER BY revision LIMIT 1;
  IF first_proof.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_ATTRIBUTION_REQUIRED' USING ERRCODE='23514'; END IF;
  items:=items||jsonb_build_array(jsonb_build_object('allocationId',a.id,'assessmentId',first_proof.id,'sourceHash',first_proof.source_hash,
   'caseId',a.case_id,'workId',a.work_id,'lineId',a.line_id,'lockId',a.lock_id,'factLineId',a.fact_line_id,'sourceId',a.source_id,
   'movementId',a.movement_id,'movementHash',a.movement_hash,'net',jsonb_build_array(a.net_numerator,a.net_denominator)));
 END LOOP;
 IF items='[]'::jsonb THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 pair:=app.recovery_allocation_fraction_sum(parts);
 RETURN jsonb_build_object('paymentId',payment,'receivedPence',received,'allocations',items,
  'qualifyingNet',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text));
END $$;

-- Lock order: all job cases in UUID order, then shared allocation-line lock,
-- then owner/session rows. No new business lock after the audit append.
CREATE FUNCTION app.payment_fee_actor(j uuid,d text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a record; c record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'PAYMENT_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM app.final_check_builder(t,j,d);
 IF NOT EXISTS(SELECT 1 FROM app.job x JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(x.tenant_id,x.id)
  WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest=d AND x.fee_policy_version='reference_fee_policy_v3'
   AND tr.job_track='small_builder' AND tr.environment='synthetic_demo')
 OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
 THEN RAISE EXCEPTION 'PAYMENT_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 FOR c IN SELECT id FROM app.recovery_case WHERE tenant_id=t AND job_id=j ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c.id::text));
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||j::text,0));
 SELECT * INTO a FROM app.final_check_builder(t,j,d,true);
 RETURN a.member_id;
END $$;

CREATE FUNCTION app.payment_fee_current(t uuid,j uuid,s uuid,actor uuid) RETURNS text
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE st app.payment_fee_statement; p record; approval app.action_authorization;
BEGIN
 SELECT * INTO st FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=j AND id=s;
 IF st.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM app.payment_fee_command c WHERE c.tenant_id=t AND c.job_id=j AND c.statement_id=s AND c.payload->>'action'='dispute') THEN RETURN 'disputed'; END IF;
 BEGIN
  IF app.payment_fee_receipt_sources(t,j,st.payment_id,actor) IS DISTINCT FROM st.sources THEN RETURN 'source_changed'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(st.prior_statements) LOOP
   IF NOT EXISTS(SELECT 1 FROM app.payment_fee_statement previous WHERE previous.tenant_id=t AND previous.job_id=j
    AND previous.id=(p.value->>'statementId')::uuid
    AND previous.sources=app.payment_fee_receipt_sources(t,j,previous.payment_id,actor))
   OR EXISTS(SELECT 1 FROM app.payment_fee_command c WHERE c.tenant_id=t AND c.job_id=j AND c.statement_id=(p.value->>'statementId')::uuid AND c.payload->>'action'='dispute')
   THEN RETURN 'source_changed'; END IF;
  END LOOP;
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM='PAYMENT_FEE_PAUSED' THEN RETURN 'disputed'; END IF;
  RETURN 'source_changed';
 END;
 SELECT a.* INTO approval FROM app.payment_fee_command c JOIN app.action_authorization a ON(a.tenant_id,a.id)=(c.tenant_id,c.authorization_id)
  WHERE c.tenant_id=t AND c.job_id=j AND c.statement_id=s;
 IF approval.id IS NULL THEN RETURN 'awaiting_approval'; END IF;
 IF approval.revoked_at IS NOT NULL THEN RETURN 'approval_revoked'; END IF;
 IF approval.expires_at<=clock_timestamp() THEN RETURN 'approval_expired'; END IF;
 RETURN 'approved';
END $$;

CREATE FUNCTION app.read_payment_fees(j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; result jsonb;
BEGIN
 actor:=app.payment_fee_actor(j,d);
 SELECT coalesce(jsonb_agg(jsonb_build_object('statement',s.document,'state',app.payment_fee_current(t,j,s.id,actor)) ORDER BY s.created_at,s.id),'[]') INTO result
  FROM app.payment_fee_statement s WHERE s.tenant_id=t AND s.job_id=j;
 RETURN jsonb_build_object('version','payment-fee-view.v1','jobId',j,'statements',result,'receipts',
  (SELECT coalesce(jsonb_agg(payment_id ORDER BY payment_id),'[]') FROM(SELECT DISTINCT s.payment_id FROM app.stored_receipt_case_allocation a
    JOIN app.receipt_allocation_fact_line l ON(l.tenant_id,l.job_id,l.id)=(a.tenant_id,a.job_id,a.fact_line_id)
    JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
    WHERE a.tenant_id=t AND a.job_id=j AND a.reverses_id IS NULL) receipts),
  'standingAuthority',NULL,'productionEnabled',false,'realExternalActions',0);
END $$;

CREATE FUNCTION app.write_payment_fee(j uuid,d text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; cid uuid; action text:=p->>'action';
 replay app.payment_fee_command; st app.payment_fee_statement; previous record;
 sources jsonb; priors jsonb:='[]'; parts jsonb:='[]'; pair numeric[]; total numeric[];
 prior_fee bigint:=0; fee bigint; cumulative bigint; doc jsonb; sid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid();
 resolution uuid:=gen_random_uuid(); auth uuid; result jsonb; state text;
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
   IF state='awaiting_approval' THEN
   INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,st.decision_id,'approved',actor);
   auth:=gen_random_uuid();
   INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,amount_pence,currency,expires_at)
    VALUES(auth,t,st.decision_id,resolution,actor,'payment_fee.collect','platform:jobguard',st.document->>'statementHash',1,'reference_fee_policy_v3',(st.document->>'feePence')::bigint,'GBP',clock_timestamp()+interval '15 minutes');
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
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['payment_fee_receipt_sources(uuid,uuid,uuid,uuid)','payment_fee_actor(uuid,text)','payment_fee_current(uuid,uuid,uuid,uuid)','read_payment_fees(uuid,text)','write_payment_fee(uuid,text,jsonb)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||f||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||f||' FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.read_payment_fees(uuid,text),app.write_payment_fee(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
