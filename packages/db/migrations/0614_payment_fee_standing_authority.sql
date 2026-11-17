BEGIN;
-- MON-4A synthetic only. No backfill: existing tenants keep per-statement approval.
-- Forward-fix by replacing routines; authority history is never rewritten.
CREATE TABLE app.payment_fee_authority (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 action text NOT NULL CHECK(action IN('opt_in','revoke')),
 cap text NOT NULL CHECK(cap='verified_receipt_fee'),
 policy_version text NOT NULL CHECK(policy_version='reference_fee_policy_v3'),
 expires_at timestamptz NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,revision),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.payment_fee_authority OWNER TO jobguard_migration;
ALTER TABLE app.payment_fee_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payment_fee_authority FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_fee_authority_tenant ON app.payment_fee_authority FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.payment_fee_authority FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER payment_fee_authority_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.payment_fee_authority
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE FUNCTION app.write_payment_fee_authority(j uuid,d text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; cid uuid;
 previous app.payment_fee_authority; prior app.payment_fee_authority;
 aid uuid:=gen_random_uuid(); deadline timestamptz; result jsonb; next_revision bigint;
BEGIN
 -- The common authorization lock comes before business/advisory locks in collection too.
 LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;
 actor:=app.payment_fee_actor(j,d);
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-fee-statement:'||t::text,0));
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'payment-fee-command.v1'
 OR p->>'action' IS NULL OR p->>'action' NOT IN('opt_in','revoke')
 OR NOT(p ?& ARRAY['version','commandId','action','expectedAuthorityId','cap'])
 OR p-ARRAY['version','commandId','action','expectedAuthorityId','cap']<>'{}'
 OR NOT coalesce(pg_input_is_valid(p->>'commandId','uuid'),false)
 OR (p->'expectedAuthorityId'<>'null'::jsonb AND NOT coalesce(pg_input_is_valid(p->>'expectedAuthorityId','uuid'),false))
 OR p->>'cap' IS DISTINCT FROM 'verified_receipt_fee'
 THEN RAISE EXCEPTION 'INVALID_PAYMENT_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p->>'commandId')::uuid;
 SELECT * INTO prior FROM app.payment_fee_authority WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.payload<>p OR prior.actor_membership_id<>actor OR prior.job_id<>j
  THEN RAISE EXCEPTION 'PAYMENT_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO previous FROM app.payment_fee_authority WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 IF previous.id IS DISTINCT FROM (p->>'expectedAuthorityId')::uuid OR (p->>'action'='revoke' AND previous.id IS NULL)
 THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='40001'; END IF;
 SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s
 JOIN app.membership m ON m.tenant_id=t AND m.id=actor WHERE s.token_digest=d;
 IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='40001'; END IF;
 next_revision:=coalesce(previous.revision,0)+1;
 result:=jsonb_build_object('authorityId',aid,'state',(CASE WHEN p->>'action'='opt_in' THEN 'active' ELSE 'revoked' END),
 'cap','verified_receipt_fee','policyVersion','reference_fee_policy_v3','expiresAt',to_char(deadline AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO app.payment_fee_authority(tenant_id,id,job_id,command_id,actor_membership_id,revision,action,cap,policy_version,expires_at,payload,result)
 VALUES(t,aid,j,cid,actor,next_revision,p->>'action','verified_receipt_fee','reference_fee_policy_v3',deadline,p,result);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor::text,j,'payment_fee.authority_'||(p->>'action'),
 jsonb_build_object('commandId',cid,'authorityId',aid,'cap','verified_receipt_fee','policyVersion','reference_fee_policy_v3'));
 RETURN result;
END $$;
ALTER FUNCTION app.write_payment_fee_authority(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_payment_fee_authority(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.write_payment_fee_authority(uuid,text,jsonb) TO jobguard_runtime;
CREATE OR REPLACE FUNCTION app.read_payment_fees(j uuid,d text) RETURNS jsonb
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
  'standingAuthority',(SELECT a.result||jsonb_build_object('state',
 CASE WHEN a.action='revoke' THEN 'revoked' WHEN a.expires_at<=clock_timestamp() OR NOT EXISTS(
 SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a.actor_membership_id AND m.expires_at>clock_timestamp())
 THEN 'stale' ELSE 'active' END) FROM app.payment_fee_authority a WHERE a.tenant_id=t ORDER BY a.revision DESC LIMIT 1),'productionEnabled',false,'realExternalActions',0);
END $$;
CREATE OR REPLACE FUNCTION app.write_platform_fee_collection(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE t uuid; actor record; c record; action text:=p_command->>'action'; cid uuid;
 prior app.platform_fee_collection_command; statement app.platform_fee_statement; attempt app.platform_fee_attempt;
 event app.platform_fee_attempt_event; snapshot jsonb; view jsonb; result jsonb; approval jsonb;
 aid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid();
 authority app.payment_fee_authority; latest_authority app.payment_fee_authority; receipt record;
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
  OR (p_command-ARRAY['version','action','commandId','statementId','statementHash','amountPence','authorityId'])<>'{}'
  OR (p_command ? 'authorityId' AND (action<>'collect' OR NOT coalesce(pg_input_is_valid(p_command->>'authorityId','uuid'),false)))))
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
 LOCK TABLE app.recovery_case_allocation,app.recovery_case_allocation_reversal,app.receipt_line_allocation,
 app.recovery_allocation_command,app.recovery_allocation_review,app.recovery_eligibility_revision,
 app.recovery_case_terms_approval,app.evidence_object,app.practice_feed_receipt_match,
 app.job_party_binding,app.job_party_current,app.evidence_upload,app.recovery_payment_payer_mark IN SHARE MODE;
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
 IF action='collect' AND p_command ? 'authorityId' THEN
  SELECT * INTO authority FROM app.payment_fee_authority WHERE tenant_id=t AND id=(p_command->>'authorityId')::uuid;
  SELECT * INTO latest_authority FROM app.payment_fee_authority WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  IF authority.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='40001'; END IF;
  IF latest_authority.action='revoke' THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_REVOKED' USING ERRCODE='40001'; END IF;
  IF authority.id<>latest_authority.id OR authority.action<>'opt_in' OR authority.expires_at<=clock_timestamp()
   OR authority.actor_membership_id<>actor.member_id OR authority.policy_version<>'reference_fee_policy_v3'
  THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='40001'; END IF;
  -- Receipt disputes are immutable commands. Case and attribution disputes also pause dispatch.
  IF EXISTS(SELECT 1 FROM app.payment_fee_command q WHERE q.tenant_id=t AND q.job_id=p_job AND q.payload->>'action'='dispute')
   OR EXISTS(SELECT 1 FROM app.recovery_case_event e WHERE e.tenant_id=t AND e.job_id=p_job AND e.event_type='dispute'
    AND NOT EXISTS(SELECT 1 FROM app.recovery_case_event later WHERE later.tenant_id=t AND later.job_id=p_job AND later.case_id=e.case_id
     AND later.sequence>e.sequence AND later.event_type IN('resume_pursuit','close_recovered','close_no_recovery')))
   OR EXISTS(SELECT 1 FROM app.shadow_signal_ineligibility i WHERE i.tenant_id=t AND i.job_id=p_job AND i.reason='attribution_disputed')
  THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_DISPUTED' USING ERRCODE='40001'; END IF;
 END IF;
 IF action IN('collect','refund') THEN
  view:=app.read_platform_fee_collection(p_job,p_session);
  IF (view->>'unknownOutcome')::boolean THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  amount:=CASE WHEN action='collect' THEN (view->>'outstandingPrincipal')::bigint-(view->>'collectionReserved')::bigint
   ELSE (view->>'refundDue')::bigint-(view->>'refundReserved')::bigint END;
  IF authority.id IS NOT NULL AND (p_command->>'amountPence')::bigint>(view->>'outstandingPrincipal')::bigint THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED' USING ERRCODE='23514'; END IF;
  IF amount<=0 OR amount<>(p_command->>'amountPence')::bigint OR (action='collect' AND (view->>'refundReserved')::bigint>0)
   OR (action='refund' AND ((view->>'collectionReserved')::bigint>0 OR amount>(view->>'retainedPrincipal')::bigint-(view->>'refundReserved')::bigint))
  THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  -- A collection's internal approval has its own namespace and must check current sources.
  -- Even a caller pre-claiming that derived UUID cannot turn this into an approval replay.
  IF authority.id IS NULL THEN
  approval:=app.write_platform_fee_statement(p_job,p_session,jsonb_build_object('version','simulation-fee-statement-command.v1',
   'commandId',overlay(overlay(md5('simulation-fee-collection:statement-approval:'||cid::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'action','approve','statementId',p_command->>'statementId','statementHash',p_command->>'statementHash'));
  IF (approval->>'replayed')::boolean THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  SELECT * INTO statement FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'statementId')::uuid;
  ELSE
   -- Validate the exact latest statement and live verified sources without creating a human statement approval.
   snapshot:=app.platform_fee_statement_sources(t,p_job,actor.member_id);
   SELECT * INTO statement FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'statementId')::uuid;
   IF statement.id IS NULL OR statement.document_hash IS DISTINCT FROM p_command->>'statementHash'
    OR statement.source_hash IS DISTINCT FROM app.final_lock_hash(snapshot)
    OR statement.id IS DISTINCT FROM (SELECT id FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job ORDER BY sequence DESC LIMIT 1)
   THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
   -- The source resolver verifies settlement and allocated qualifying value. A standing authority cannot raise the fee.
   IF amount>(snapshot->>'feePence')::bigint OR amount>(statement.document->'documentPrincipal'->>'pence')::bigint
   THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED' USING ERRCODE='23514'; END IF;
   FOR receipt IN SELECT * FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=p_job LOOP
    IF app.payment_fee_current(t,p_job,receipt.id,actor.member_id) NOT IN('awaiting_approval','approved')
    THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='40001'; END IF;
   END LOOP;
  END IF;
  SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s JOIN app.membership m ON m.tenant_id=t AND m.id=actor.member_id WHERE s.token_digest=p_session;
  IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF authority.id IS NOT NULL THEN deadline:=least(deadline,authority.expires_at); END IF;
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
  jsonb_build_object('commandId',cid,'attemptId',aid,'authorityId',authority.id));
 RETURN result;
EXCEPTION WHEN deadlock_detected THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
END $$;
COMMIT;
