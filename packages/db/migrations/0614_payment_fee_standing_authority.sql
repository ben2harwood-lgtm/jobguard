BEGIN;
-- MON-4A RED. Synthetic only; append-only opt-in/revocation. No DD/provider route.
-- Forward fix: leave historical rows and statement preparation unchanged. Roll back
-- operationally by revoking authority; schema rollback would discard consent history.
CREATE TABLE app.payment_fee_authority (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), actor_membership_id uuid NOT NULL,
 session_digest char(64) NOT NULL REFERENCES control_plane.practice_session(token_digest),
 action text NOT NULL CHECK(action IN('opt_in','revoke')),
 cap text NOT NULL CHECK(cap='per_verified_receipt_fee'),
 policy_version text NOT NULL CHECK(policy_version='reference_fee_policy_v3'),
 expires_at timestamptz NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,revision),
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
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid;
 case_row record; prior app.payment_fee_authority; latest app.payment_fee_authority; cid uuid; deadline timestamptz; doc jsonb;
BEGIN
 -- Follow collection's business lock order; take the tenant fence before audit.
 LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;
 PERFORM app.lock_success_fee_sources();
 FOR case_row IN SELECT id FROM app.recovery_case WHERE tenant_id=t AND job_id=j ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(case_row.id::text));
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||j::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-fee-statement:'||t::text,0));
 actor:=app.payment_fee_actor(j,d);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'payment-fee-authority-command.v1'
  OR p->>'action' IS NULL OR p->>'action' NOT IN('opt_in','revoke')
  OR NOT(p ?& ARRAY['version','commandId','action','expectedAuthorityId','cap','policyVersion'])
  OR p-ARRAY['version','commandId','action','expectedAuthorityId','cap','policyVersion']<>'{}'
  OR NOT coalesce(pg_input_is_valid(p->>'commandId','uuid'),false)
  OR (p->'expectedAuthorityId'<>'null'::jsonb AND NOT coalesce(pg_input_is_valid(p->>'expectedAuthorityId','uuid'),false))
  OR p->>'cap' IS DISTINCT FROM 'per_verified_receipt_fee' OR p->>'policyVersion' IS DISTINCT FROM 'reference_fee_policy_v3'
 THEN RAISE EXCEPTION 'INVALID_PAYMENT_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p->>'commandId')::uuid;
 SELECT * INTO prior FROM app.payment_fee_authority WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.actor_membership_id<>actor OR prior.payload<>p
  THEN RAISE EXCEPTION 'PAYMENT_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO latest FROM app.payment_fee_authority WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 IF latest.command_id IS DISTINCT FROM (p->>'expectedAuthorityId')::uuid OR (p->>'action'='revoke' AND latest.command_id IS NULL)
 THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='23514'; END IF;
 SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s
  JOIN app.membership m ON m.tenant_id=t AND m.id=actor WHERE s.token_digest=d;
 IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'PAYMENT_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 doc:=jsonb_build_object('version','payment-fee-authority.v1','authorityId',cid,
  'state',CASE WHEN p->>'action'='opt_in' THEN 'active' ELSE 'revoked' END,
  'cap','per_verified_receipt_fee','policyVersion','reference_fee_policy_v3','expiresAt',deadline,
  'productionEnabled',false,'realExternalActions',0);
 INSERT INTO app.payment_fee_authority(tenant_id,job_id,command_id,revision,actor_membership_id,session_digest,action,cap,policy_version,expires_at,payload,result)
 VALUES(t,j,cid,coalesce(latest.revision,0)+1,actor,d,p->>'action','per_verified_receipt_fee','reference_fee_policy_v3',deadline,p,doc);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor::text,j,'payment_fee_authority.'||(p->>'action'),
  jsonb_build_object('commandId',cid,'cap','per_verified_receipt_fee','policyVersion','reference_fee_policy_v3'));
 RETURN doc;
END $$;
ALTER FUNCTION app.write_payment_fee_authority(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_payment_fee_authority(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.write_payment_fee_authority(uuid,text,jsonb) TO jobguard_runtime;
CREATE OR REPLACE FUNCTION app.payment_fee_receipt_sources(t uuid,j uuid,payment uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE a record; latest app.recovery_attribution_revision; first_proof app.recovery_attribution_revision; live jsonb;
 withheld jsonb; items jsonb:='[]'; parts jsonb:='[]'; pair numeric[]; allocated numeric[]; received bigint;
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
 -- Reuse the latest withheld-receipt validator; pending or unmatched cash never qualifies.
 FOR a IN SELECT * FROM app.recovery_case_allocation WHERE tenant_id=t AND job_id=j AND payment_id=payment ORDER BY id LOOP
  IF EXISTS(SELECT 1 FROM app.recovery_case_event e WHERE e.tenant_id=t AND e.job_id=j AND e.case_id=a.case_id AND e.event_type='dispute'
   AND NOT EXISTS(SELECT 1 FROM app.recovery_case_event later WHERE later.tenant_id=t AND later.job_id=j AND later.case_id=e.case_id
    AND later.sequence>e.sequence AND later.event_type IN('resume_pursuit','close_recovered','close_no_recovery')))
  THEN RAISE EXCEPTION 'PAYMENT_FEE_PAUSED' USING ERRCODE='23514'; END IF;
  BEGIN
   withheld:=app.success_fee_withheld_source(t,j,a.id);
  EXCEPTION WHEN SQLSTATE '40001' THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_CHANGED' USING ERRCODE='23514';
  END;
  parts:=parts||jsonb_build_array(jsonb_build_array(withheld->'remainingPrincipal'->>'numerator',withheld->'remainingPrincipal'->>'denominator'));
  items:=items||jsonb_build_array((withheld-'source')||(withheld->'source'));
 END LOOP;
 IF items='[]'::jsonb THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 pair:=app.recovery_allocation_fraction_sum(parts);
 IF pair[1]>received*pair[2] THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('paymentId',payment,'receivedPence',received,'allocations',items,
  'qualifyingNet',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text));
END $$;

CREATE OR REPLACE FUNCTION app.read_payment_fees(j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; result jsonb; authority app.payment_fee_authority; authority_view jsonb;
BEGIN
 actor:=app.payment_fee_actor(j,d);
 SELECT * INTO authority FROM app.payment_fee_authority WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 IF authority.command_id IS NOT NULL THEN
  authority_view:=authority.result||jsonb_build_object('state',CASE WHEN authority.action='revoke' THEN 'revoked'
   WHEN authority.expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM control_plane.practice_session s WHERE s.token_digest=authority.session_digest AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=authority.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN 'stale' ELSE 'active' END);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('statement',s.document,'state',app.payment_fee_current(t,j,s.id,actor)) ORDER BY s.created_at,s.id),'[]') INTO result
  FROM app.payment_fee_statement s WHERE s.tenant_id=t AND s.job_id=j;
 RETURN jsonb_build_object('version','payment-fee-view.v1','jobId',j,'statements',result,'receipts',
  (SELECT coalesce(jsonb_agg(payment_id ORDER BY payment_id),'[]') FROM(SELECT DISTINCT s.payment_id FROM app.stored_receipt_case_allocation a
    JOIN app.receipt_allocation_fact_line l ON(l.tenant_id,l.job_id,l.id)=(a.tenant_id,a.job_id,a.fact_line_id)
    JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
    WHERE a.tenant_id=t AND a.job_id=j AND a.reverses_id IS NULL
    UNION SELECT payment_id FROM app.recovery_case_allocation WHERE tenant_id=t AND job_id=j) receipts),
  'standingAuthority',authority_view,'productionEnabled',false,'realExternalActions',0);
END $$;

CREATE OR REPLACE FUNCTION app.write_platform_fee_collection(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE t uuid; actor record; c record; action text:=p_command->>'action'; cid uuid;
 prior app.platform_fee_collection_command; statement app.platform_fee_statement; attempt app.platform_fee_attempt;
 event app.platform_fee_attempt_event; snapshot jsonb; view jsonb; result jsonb; approval jsonb;
 aid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid();
 amount bigint; deadline timestamptz; next_state text;
 authority app.payment_fee_authority; receipt app.payment_fee_statement; receipt_state text;
 standing boolean:=p_command ? 'authorityId'; used_pence bigint;
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
  OR (p_command-ARRAY['version','action','commandId','statementId','statementHash','amountPence','authorityId','receiptStatementId'])<>'{}'
  OR ((p_command ? 'authorityId') IS DISTINCT FROM (p_command ? 'receiptStatementId'))
  OR (standing AND (action<>'collect' OR NOT coalesce(pg_input_is_valid(p_command->>'authorityId','uuid'),false)
   OR NOT coalesce(pg_input_is_valid(p_command->>'receiptStatementId','uuid'),false)))))
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
 IF standing THEN
  SELECT * INTO authority FROM app.payment_fee_authority WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  IF authority.action='revoke' THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_REVOKED' USING ERRCODE='23514'; END IF;
  IF authority.command_id IS NULL OR authority.command_id IS DISTINCT FROM (p_command->>'authorityId')::uuid
   OR authority.expires_at<=clock_timestamp()
   OR NOT EXISTS(SELECT 1 FROM control_plane.practice_session s WHERE s.token_digest=authority.session_digest AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE) OR authority.policy_version<>'reference_fee_policy_v3'
   OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=authority.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE)
  THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='23514'; END IF;
  SELECT * INTO receipt FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'receiptStatementId')::uuid;
  IF receipt.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  receipt_state:=app.payment_fee_current(t,p_job,receipt.id,actor.member_id);
  IF receipt_state='disputed' THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_DISPUTED' USING ERRCODE='23514'; END IF;
  IF receipt_state='source_changed' THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='23514'; END IF;
  -- Every receipt allocation must belong to the current posted platform statement.
  snapshot:=app.platform_fee_statement_sources(t,p_job,actor.member_id);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(receipt.sources->'allocations') r WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(snapshot->'sources') s WHERE s->'allocationIds' ? (r->>'allocationId')
    OR s->>'recoveryAllocationId'=r->>'recoveryAllocationId'))
  THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='23514'; END IF;
  -- Count every non-failed reservation for this receipt, across authority renewals.
  SELECT coalesce(sum(a.amount_pence),0) INTO used_pence FROM app.platform_fee_attempt a
   JOIN app.platform_fee_collection_command cmd ON cmd.tenant_id=a.tenant_id AND cmd.result->>'attemptId'=a.id::text
   JOIN LATERAL(SELECT state FROM app.platform_fee_attempt_event e WHERE e.tenant_id=t AND e.attempt_id=a.id ORDER BY revision DESC LIMIT 1) e ON true
   WHERE a.tenant_id=t AND a.job_id=p_job AND a.kind='collection' AND e.state<>'definite_failure'
    AND cmd.payload->>'receiptStatementId'=receipt.id::text AND cmd.payload->>'action'='collect';
  IF (p_command->>'amountPence')::bigint<=0 OR (p_command->>'amountPence')::bigint+used_pence>(receipt.document->>'feePence')::bigint
  THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED' USING ERRCODE='23514'; END IF;
 END IF;
 IF action IN('collect','refund') THEN
  view:=app.read_platform_fee_collection(p_job,p_session);
  IF (view->>'unknownOutcome')::boolean THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  amount:=CASE WHEN action='collect' THEN (view->>'outstandingPrincipal')::bigint-(view->>'collectionReserved')::bigint
   ELSE (view->>'refundDue')::bigint-(view->>'refundReserved')::bigint END;
  IF standing AND (p_command->>'amountPence')::bigint<=amount THEN amount:=(p_command->>'amountPence')::bigint; END IF;
  IF amount<=0 OR amount<>(p_command->>'amountPence')::bigint OR (action='collect' AND (view->>'refundReserved')::bigint>0)
   OR (action='refund' AND ((view->>'collectionReserved')::bigint>0 OR amount>(view->>'retainedPrincipal')::bigint-(view->>'refundReserved')::bigint))
  THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  -- A collection's internal approval has its own namespace and must check current sources.
  -- Even a caller pre-claiming that derived UUID cannot turn this into an approval replay.
  IF NOT standing THEN
  approval:=app.write_platform_fee_statement(p_job,p_session,jsonb_build_object('version','simulation-fee-statement-command.v1',
   'commandId',overlay(overlay(md5('simulation-fee-collection:statement-approval:'||cid::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,'action','approve','statementId',p_command->>'statementId','statementHash',p_command->>'statementHash'));
  IF (approval->>'replayed')::boolean THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT * INTO statement FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'statementId')::uuid;
   IF statement.id IS NULL OR statement.document_hash IS DISTINCT FROM p_command->>'statementHash'
    OR statement.source_hash IS DISTINCT FROM app.final_lock_hash(snapshot)
    OR statement.id IS DISTINCT FROM (SELECT id FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job ORDER BY sequence DESC LIMIT 1)
   THEN RAISE EXCEPTION 'PAYMENT_FEE_AUTHORITY_STALE' USING ERRCODE='23514'; END IF;
  END IF;
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
  jsonb_build_object('commandId',cid,'attemptId',aid,'standingAuthorityId',CASE WHEN standing THEN authority.command_id END,'receiptStatementId',CASE WHEN standing THEN receipt.id END));
 RETURN result;
EXCEPTION WHEN deadlock_detected THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
END $$;

COMMIT;
