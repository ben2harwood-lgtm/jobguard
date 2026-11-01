BEGIN;
-- M4-12-S RED. Fake rails only; append-only attempts, events and command receipts.
CREATE TABLE app.platform_fee_attempt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL,
 statement_id uuid NOT NULL, authorization_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('collection','refund')),
 amount_pence bigint NOT NULL CHECK(amount_pence>0 AND amount_pence<=1000000000000),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,statement_id) REFERENCES app.platform_fee_statement(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
CREATE TABLE app.platform_fee_attempt_event (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, attempt_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 state text NOT NULL CHECK(state IN ('pending','outcome_unknown','settled','definite_failure')),
 PRIMARY KEY(tenant_id,attempt_id,revision),
 FOREIGN KEY(tenant_id,job_id,attempt_id) REFERENCES app.platform_fee_attempt(tenant_id,job_id,id)
);
CREATE TABLE app.platform_fee_collection_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 payload jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['platform_fee_attempt','platform_fee_attempt_event','platform_fee_collection_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY success_fee_tenant ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END) WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER success_fee_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
CREATE FUNCTION app.read_platform_fee_collection(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record; availability jsonb; attempts jsonb:='[]'; snapshot jsonb;
 collected bigint:=0; refunded bigint:=0; cr bigint:=0; rr bigint:=0; fee bigint:=0; unknown_outcome boolean:=false;
BEGIN
 availability:=app.read_success_fee_v3(p_job,p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF (availability->>'state')='catch_review_available' THEN
  SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,false);
  snapshot:=app.platform_fee_statement_sources(t,p_job,actor.member_id); fee:=(snapshot->>'feePence')::bigint;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'statementId',a.statement_id,'kind',a.kind,'amountPence',a.amount_pence,'state',e.state) ORDER BY a.id),'[]'),
   coalesce(sum(a.amount_pence) FILTER(WHERE a.kind='collection' AND e.state='settled'),0),
   coalesce(sum(a.amount_pence) FILTER(WHERE a.kind='refund' AND e.state='settled'),0),
   coalesce(sum(a.amount_pence) FILTER(WHERE a.kind='collection' AND e.state IN('pending','outcome_unknown')),0),
   coalesce(sum(a.amount_pence) FILTER(WHERE a.kind='refund' AND e.state IN('pending','outcome_unknown')),0),
   coalesce(bool_or(e.state='outcome_unknown'),false)
  INTO attempts,collected,refunded,cr,rr,unknown_outcome
  FROM app.platform_fee_attempt a JOIN LATERAL
   (SELECT state FROM app.platform_fee_attempt_event WHERE tenant_id=t AND attempt_id=a.id ORDER BY revision DESC LIMIT 1) e ON true
  WHERE a.tenant_id=t AND a.job_id=p_job;
 END IF;
 RETURN jsonb_build_object('version','simulation-fee-collection-view.v1','jobId',p_job,'attempts',attempts,
  'settledPrincipal',collected,'refundedPrincipal',refunded,'retainedPrincipal',collected-refunded,
  'outstandingPrincipal',greatest(0,fee-collected+refunded),'refundDue',greatest(0,collected-refunded-fee),
  'collectionReserved',cr,'refundReserved',rr,'unknownOutcome',unknown_outcome);
END $$;
CREATE FUNCTION app.write_platform_fee_collection(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE t uuid; actor record; c record; action text:=p_command->>'action'; cid uuid;
 prior app.platform_fee_collection_command; statement app.platform_fee_statement; attempt app.platform_fee_attempt;
 event app.platform_fee_attempt_event; snapshot jsonb; view jsonb; result jsonb; approval jsonb;
 aid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid();
 amount bigint; deadline timestamptz; next_state text;
BEGIN
 PERFORM app.read_success_fee_v3(p_job,p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job)
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR (p_command->>'version') IS DISTINCT FROM 'simulation-fee-collection-command.v1'
 OR action IS NULL OR action NOT IN('collect','refund','redirect','unknown','settle','fail')
 OR NOT(p_command ?& ARRAY['version','action','commandId']) OR NOT coalesce(pg_input_is_valid(p_command->>'commandId','uuid'),false)
 OR (action IN('collect','refund') AND (NOT(p_command ?& ARRAY['statementId','statementHash','amountPence'])
  OR NOT coalesce(pg_input_is_valid(p_command->>'statementId','uuid'),false) OR jsonb_typeof(p_command->'amountPence') IS DISTINCT FROM 'number' OR NOT coalesce(pg_input_is_valid(p_command->>'amountPence','bigint'),false)
  OR coalesce(p_command->>'statementHash','') !~ '^[a-f0-9]{64}$'
  OR (p_command-ARRAY['version','action','commandId','statementId','statementHash','amountPence'])<>'{}'))
 OR (action NOT IN('collect','refund') AND (NOT coalesce(pg_input_is_valid(p_command->>'attemptId','uuid'),false)
  OR (p_command-ARRAY['version','action','commandId','attemptId'])<>'{}'))
 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 -- session_user is the connection identity, unaffected by this SECURITY DEFINER owner
 -- or by caller-controlled settings. Only the internal migration/operator connection
 -- can report fake-rail terminal facts, including replays of already recorded events.
 IF action IN('settle','fail') AND NOT pg_has_role(session_user,'jobguard_migration','USAGE')
 THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 cid:=(p_command->>'commandId')::uuid;
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

 SELECT * INTO prior FROM app.platform_fee_collection_command WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.job_id<>p_job OR prior.actor_membership_id<>actor.member_id OR prior.payload<>p_command
  THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF action IN('collect','refund') THEN
  view:=app.read_platform_fee_collection(p_job,p_session);
  IF (view->>'unknownOutcome')::boolean THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  amount:=CASE WHEN action='collect' THEN (view->>'outstandingPrincipal')::bigint-(view->>'collectionReserved')::bigint
   ELSE (view->>'refundDue')::bigint-(view->>'refundReserved')::bigint END;
  IF amount<=0 OR amount<>(p_command->>'amountPence')::bigint OR (action='collect' AND (view->>'refundReserved')::bigint>0)
   OR (action='refund' AND ((view->>'collectionReserved')::bigint>0 OR amount>(view->>'retainedPrincipal')::bigint-(view->>'refundReserved')::bigint))
  THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  -- A collection's internal approval has its own namespace and must check current sources.
  -- Even a caller pre-claiming that derived UUID cannot turn this into an approval replay.
  approval:=app.write_platform_fee_statement(p_job,p_session,jsonb_build_object('version','simulation-fee-statement-command.v1',
   'commandId',overlay(overlay(md5('simulation-fee-collection:statement-approval:'||cid::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'action','approve','statementId',p_command->>'statementId','statementHash',p_command->>'statementHash'));
  IF (approval->>'replayed')::boolean THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  SELECT * INTO statement FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'statementId')::uuid;
  SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s JOIN app.membership m ON m.tenant_id=t AND m.id=actor.member_id WHERE s.token_digest=p_session;
  IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'simulation_fee_attempt',aid::text,'success_fee.simulated_'||action);
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,decision,'approved',actor.member_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,amount_pence,currency,aggregate_revision,policy_version,expires_at)
   VALUES(auth_id,t,decision,resolution,actor.member_id,'success_fee.simulated_'||action,'fake-rail:'||aid::text,statement.document_hash,amount,'GBP',
    (statement.document->'sourceSnapshot'->>'postingRevision')::integer,'reference_fee_policy_v3',deadline);
  INSERT INTO app.platform_fee_attempt VALUES(t,p_job,aid,statement.id,auth_id,CASE WHEN action='collect' THEN 'collection' ELSE 'refund' END,amount);
  INSERT INTO app.platform_fee_attempt_event VALUES(t,p_job,aid,1,'pending');
 ELSE
  aid:=(p_command->>'attemptId')::uuid;
  SELECT * INTO attempt FROM app.platform_fee_attempt WHERE tenant_id=t AND job_id=p_job AND id=aid;
  IF attempt.id IS NULL THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO event FROM app.platform_fee_attempt_event WHERE tenant_id=t AND attempt_id=aid ORDER BY revision DESC LIMIT 1;
  next_state:=CASE action WHEN 'redirect' THEN event.state WHEN 'unknown' THEN 'outcome_unknown' WHEN 'settle' THEN 'settled' ELSE 'definite_failure' END;
  IF next_state<>event.state THEN
   IF event.state NOT IN('pending','outcome_unknown') OR (event.state='outcome_unknown' AND next_state='pending')
   THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
   -- These are explicit fake-rail reconciliation facts, never redirect-derived settlement.
   INSERT INTO app.platform_fee_attempt_event VALUES(t,p_job,aid,event.revision+1,next_state);
  END IF;
 END IF;
 result:=jsonb_build_object('version','simulation-fee-collection-result.v1','commandId',cid,'attemptId',aid,'replayed',false);
 INSERT INTO app.platform_fee_collection_command VALUES(t,p_job,cid,actor.member_id,p_command,result);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_fee_collection.'||action,
  jsonb_build_object('commandId',cid,'attemptId',aid));
 RETURN result;
EXCEPTION WHEN deadlock_detected THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
END $$;
ALTER FUNCTION app.read_platform_fee_collection(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_platform_fee_collection(uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.read_platform_fee_collection(uuid,text) TO jobguard_runtime;
ALTER FUNCTION app.write_platform_fee_collection(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_platform_fee_collection(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.write_platform_fee_collection(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
