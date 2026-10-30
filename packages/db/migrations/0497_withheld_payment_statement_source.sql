BEGIN;
-- RED M4-9-S/M4-10-S/M4-17-S. Forward fix only; existing private ACLs retained.
-- Forward-fix strategy: retain immutable documents/allocations and replace routines in a later migration.
-- Reverting the loader would disable withheld statements; no financial history needs backfill or deletion.
-- Withheld sources use the 0489 validator, not fabricated catch assessments.
CREATE OR REPLACE FUNCTION app.platform_fee_statement_sources(t uuid,j uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE latest app.success_fee_derivation; saved app.success_fee_review; source jsonb; live jsonb; assessment app.recovery_attribution_revision;
 approval app.action_authorization; rc app.recovery_case_current; landing app.recovery_case_allocation;
 eligibility app.recovery_eligibility_revision; proof app.evidence_object; movement app.practice_feed_event;
 terms app.recovery_case_terms_approval; reversals jsonb; remaining bigint; reversed_net bigint; reversed_gross bigint;
 parts jsonb:='[]'; sources jsonb:='[]'; derivations jsonb; pair numeric[]; fee bigint;
BEGIN
 SELECT * INTO latest FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 IF latest.id IS NULL THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF EXISTS(SELECT 1 FROM app.success_fee_derivation d JOIN app.action_authorization a ON(a.tenant_id,a.id)=(d.tenant_id,d.authorization_id) WHERE d.tenant_id=t AND d.job_id=j AND (a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp()))
 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT * INTO saved FROM app.success_fee_review WHERE tenant_id=t AND job_id=j AND id=latest.review_id;
 FOR source IN SELECT value FROM jsonb_array_elements(saved.statement->'sources') LOOP
  IF source ? 'recoveryAllocationId' THEN
   SELECT * INTO landing FROM app.recovery_case_allocation
    WHERE tenant_id=t AND job_id=j AND id=(source->>'recoveryAllocationId')::uuid;
   IF landing.id IS NULL THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=landing.case_id;
  SELECT * INTO eligibility FROM app.recovery_eligibility_revision WHERE tenant_id=t AND job_id=j AND case_id=landing.case_id ORDER BY revision DESC LIMIT 1;
  SELECT * INTO movement FROM app.practice_feed_event WHERE tenant_id=t AND job_id=j AND id=landing.movement_id;
  SELECT * INTO terms FROM app.recovery_case_terms_approval WHERE tenant_id=t AND job_id=j AND case_id=landing.case_id;
  SELECT e.* INTO proof FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
   WHERE e.tenant_id=t AND e.job_id=j AND e.id=landing.evidence_id AND e.kind='original'
    AND (e.object_version_id,e.sha256,e.server_received_at)=(landing.object_version_id,landing.evidence_hash,landing.evidence_server_received_at)
    AND e.server_verified_at IS NOT NULL AND u.state='verified';
  IF rc.id IS NULL OR rc.case_type IS DISTINCT FROM 'withheld_customer_payment' OR NOT rc.synthetic OR rc.state='prevented' OR rc.claim_revision IS NULL OR rc.book<>'builder_customer'
   OR eligibility.id IS NULL OR eligibility.status<>'approved' OR eligibility.classification<>'eligible_for_review'
   OR proof.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=proof.id)
   OR movement.id IS NULL OR movement.state<>'settled' OR movement.identity<>'identified'
   OR movement.source_hash<>landing.movement_hash OR movement.created_at<=rc.created_at
   OR terms.id IS NULL OR terms.approved_at>movement.created_at
   OR NOT EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=t AND a.id=terms.authorization_id AND a.revoked_at IS NULL)
   OR coalesce(app.recovery_job_payer_type(t,j),'unknown')='insurer'
   OR NOT rc.source_refs ? landing.invoice_id::text
   OR NOT EXISTS(SELECT 1 FROM app.practice_feed_receipt_match m JOIN app.customer_payment p
    ON(p.tenant_id,p.job_id,p.id)=(m.tenant_id,m.job_id,m.payment_id)
    WHERE m.tenant_id=t AND m.job_id=j AND m.payment_id=landing.payment_id AND p.invoice_id=landing.invoice_id
     AND m.account_id=movement.account_id AND m.settled_event_id=movement.event_id
     AND p.amount_pence=m.matched_pence AND m.matched_pence=movement.gross_pence)
   OR EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.account_id=movement.account_id AND e.movement_key=movement.movement_key
    AND e.state IN('reversed','possible_duplicate') AND (e.state='reversed' OR NOT EXISTS(
     SELECT 1 FROM app.practice_feed_command q WHERE q.tenant_id=t AND q.account_id=e.account_id AND q.movement_key=e.movement_key AND q.action='reconcile_duplicate')))
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  -- A forged generic authority cannot replace the allocator's durable command.
  SELECT auth.* INTO approval FROM app.action_authorization auth
   JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(auth.tenant_id,auth.resolution_id,auth.decision_id)
   JOIN app.recovery_allocation_review r ON(r.tenant_id,r.job_id,r.id)=(landing.tenant_id,landing.job_id,landing.review_id)
   JOIN app.recovery_allocation_command cmd ON(cmd.tenant_id,cmd.job_id,cmd.command_id)=(landing.tenant_id,landing.job_id,landing.command_id)
   WHERE auth.tenant_id=t AND auth.id=landing.authorization_id AND auth.action_type='recovery_allocation.allocate'
    AND auth.recipient=landing.case_id::text AND auth.content_hash=r.approval_hash AND auth.decision_id=r.decision_id
    AND auth.amount_pence=landing.gross_pence AND auth.currency='GBP' AND auth.policy_version=landing.policy_version
    AND auth.actor_membership_id=cmd.actor_membership_id AND dr.actor_membership_id=cmd.actor_membership_id
    AND dr.resolution='approved' AND auth.revoked_at IS NULL AND cmd.created_at<=auth.expires_at
    AND cmd.payload->>'action'='allocate' AND cmd.result->>'allocationId'=landing.id::text
    AND (r.artifact->>'eligibleNetPence')::bigint=landing.eligible_net_pence
    AND r.artifact->>'evidenceId'=landing.evidence_id::text AND r.artifact->>'movementId'=landing.movement_id::text;
  IF approval.id IS NULL THEN RAISE EXCEPTION 'SUCCESS_FEE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'),coalesce(sum(r.eligible_net_pence),0),coalesce(sum(r.gross_pence),0)
   INTO reversals,reversed_net,reversed_gross FROM app.recovery_case_allocation_reversal r
   WHERE r.tenant_id=t AND r.job_id=j AND r.allocation_id=landing.id;
  IF reversed_net>landing.eligible_net_pence OR reversed_gross>landing.gross_pence
   OR EXISTS(SELECT 1 FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=j AND r.allocation_id=landing.id
    AND NOT EXISTS(SELECT 1 FROM app.recovery_allocation_command cmd JOIN app.action_authorization auth
     ON(auth.tenant_id,auth.id)=(r.tenant_id,r.authorization_id)
     JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(auth.tenant_id,auth.resolution_id,auth.decision_id)
     WHERE cmd.tenant_id=t AND cmd.job_id=j AND cmd.command_id=r.command_id AND cmd.payload->>'action'='reverse'
      AND cmd.result->>'allocationId'=landing.id::text AND auth.action_type='recovery_allocation.reverse'
      AND auth.revoked_at IS NULL AND dr.resolution='approved' AND auth.amount_pence=r.gross_pence))
   OR (EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j AND payment_id=landing.payment_id)
    AND reversed_gross<>landing.gross_pence)
   OR EXISTS(SELECT 1 FROM app.customer_credit_note cn WHERE cn.tenant_id=t AND cn.job_id=j AND cn.invoice_id=landing.invoice_id
    AND NOT EXISTS(SELECT 1 FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=j AND r.allocation_id=landing.id AND r.credit_note_id=cn.id))
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  remaining:=landing.eligible_net_pence-reversed_net;
  IF (SELECT coalesce(sum(ca.eligible_net_pence),0) FROM app.recovery_case_allocation ca WHERE ca.tenant_id=t AND ca.job_id=j AND ca.case_id=landing.case_id)>least(rc.claim_pence,eligibility.eligible_net_pence)
   OR (SELECT coalesce(sum(ca.gross_pence),0) FROM app.recovery_case_allocation ca WHERE ca.tenant_id=t AND ca.job_id=j AND ca.payment_id=landing.payment_id)>movement.gross_pence
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  IF jsonb_array_length(sources)>=10000 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
  parts:=parts||jsonb_build_array(jsonb_build_array(remaining::text,'1'));
  live:=jsonb_build_object('caseId',landing.case_id,'recoveryAllocationId',landing.id,
   'reviewAuthorizationId',approval.id,'sourceHash',app.final_lock_hash(jsonb_build_object(
    'allocation',to_jsonb(landing),'reversals',reversals,'eligibility',to_jsonb(eligibility),'caseRevision',rc.revision,
    'terms',terms.id,'movement',to_jsonb(movement),'proof',to_jsonb(proof))));
  IF live->>'sourceHash' IS DISTINCT FROM source->>'sourceHash'
   OR live->>'reviewAuthorizationId' IS DISTINCT FROM source->>'reviewAuthorizationId'
   OR live->>'caseId' IS DISTINCT FROM source->>'caseId'
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  sources:=sources||jsonb_build_array(live||jsonb_build_object(
   'remainingPrincipal',jsonb_build_object('numerator',remaining::text,'denominator','1'),
   'paymentId',landing.payment_id,'invoiceId',landing.invoice_id,
   'reversalIds',(SELECT coalesce(jsonb_agg(r.id ORDER BY r.id),'[]') FROM app.recovery_case_allocation_reversal r
     WHERE r.tenant_id=t AND r.job_id=j AND r.allocation_id=landing.id)));

   CONTINUE;
  END IF;
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
CREATE OR REPLACE FUNCTION app.simulation_money_sources(t uuid,j uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb:=jsonb_build_object('version','simulation-money-snapshot.v1','tenantId',t,'jobId',j); live jsonb;
BEGIN
 SELECT result||jsonb_build_object('customer_invoice',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_invoice x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('customer_credit_note',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_credit_note x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('customer_payment',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_payment x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('customer_payment_reversal',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_payment_reversal x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_allocation_fact_revision',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.receipt_allocation_fact_revision x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_allocation_fact_source',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.receipt_allocation_fact_source x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_allocation_fact_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.receipt_allocation_fact_line x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('stored_receipt_case_allocation',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.stored_receipt_case_allocation x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('success_fee_derivation',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.success_fee_derivation x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('success_fee_journal',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.success_fee_journal x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('success_fee_journal_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.success_fee_journal_line x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('platform_fee_statement',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_fee_statement x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('platform_fee_attempt',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_fee_attempt x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('platform_fee_attempt_event',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_fee_attempt_event x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('subscription_period',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_period x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('subscription_period_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_period_line x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('platform_statement',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_statement x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('platform_statement_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_statement_line x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('subscription_simulated_work',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_simulated_work x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('subscription_simulated_result',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_simulated_result x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('practice_feed_event',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.practice_feed_event x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('practice_feed_receipt_match',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.practice_feed_receipt_match x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('practice_feed_command',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.practice_feed_command x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('recovery_case_allocation',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.recovery_case_allocation x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('recovery_case_allocation_reversal',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.recovery_case_allocation_reversal x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_line_allocation',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.receipt_line_allocation x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 IF EXISTS(SELECT 1 FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=j) THEN
  BEGIN
   live:=app.platform_fee_statement_sources(t,j,actor);
  EXCEPTION WHEN SQLSTATE '40001' OR SQLSTATE '0A000' THEN
   live:=jsonb_build_object('unavailable',true);
  END;
 END IF;
 RETURN result||jsonb_build_object('liveFee',live);
END $$;
CREATE OR REPLACE FUNCTION app.write_platform_fee_statement(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE t uuid; actor record; c record; action text:=p_command->>'action'; cid uuid;
 prior app.platform_fee_statement_command; existing app.platform_fee_statement; previous app.platform_fee_statement;
 snapshot jsonb; source_hash text; document jsonb; history jsonb; digest text; result jsonb;
 sid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); authorization uuid;
 sequence integer; amount bigint; deadline timestamptz;
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
 -- Same source fence and lock order as 0393; acquire all business locks before audit.
 LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE app.recovery_attribution_revision,app.recovery_attribution_command,
 app.stored_receipt_case_allocation,app.receipt_allocation_fact_source,
 app.receipt_allocation_fact_line,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_command,
 app.customer_payment_reversal,app.customer_credit_note,app.practice_feed_event,app.practice_feed_command,
 app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,
 app.recovery_case,app.recovery_claim_revision,app.recovery_case_event,
 app.recovery_case_allocation,app.recovery_case_allocation_reversal,app.receipt_line_allocation,
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
 SELECT * INTO prior FROM app.platform_fee_statement_command WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.job_id<>p_job OR prior.actor_membership_id<>actor.member_id OR prior.payload<>p_command
  THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 snapshot:=app.platform_fee_statement_sources(t,p_job,actor.member_id); source_hash:=app.final_lock_hash(snapshot);
 SELECT s.* INTO previous FROM app.platform_fee_statement s WHERE s.tenant_id=t AND s.job_id=p_job ORDER BY s.sequence DESC LIMIT 1;
 IF action='issue' THEN
  SELECT * INTO existing FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job AND platform_fee_statement.source_hash=write_platform_fee_statement.source_hash;
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
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'simulation_fee_statement',sid::text,'success_fee.statement_approve');
   INSERT INTO app.platform_fee_statement(tenant_id,job_id,id,sequence,namespace,source_hash,document,document_hash,original_id,decision_id)
    VALUES(t,p_job,sid,sequence,'success_fee.synthetic.v1',source_hash,document,digest,previous.id,decision);
  ELSE sid:=existing.id; digest:=existing.document_hash;
  END IF;
 ELSE
  SELECT * INTO existing FROM app.platform_fee_statement WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'statementId')::uuid;
  IF existing.id IS NULL OR existing.id IS DISTINCT FROM previous.id OR existing.document_hash IS DISTINCT FROM p_command->>'statementHash'
   OR existing.source_hash IS DISTINCT FROM source_hash
  THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
  sid:=existing.id; digest:=existing.document_hash;
  SELECT id INTO authorization FROM app.action_authorization WHERE tenant_id=t AND decision_id=existing.decision_id AND revoked_at IS NULL AND expires_at>clock_timestamp();
  IF authorization IS NULL THEN
   IF EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=existing.decision_id)
   THEN RAISE EXCEPTION 'SUCCESS_FEE_STALE' USING ERRCODE='40001'; END IF;
   SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s JOIN app.membership m ON m.tenant_id=t AND m.id=actor.member_id WHERE s.token_digest=p_session;
   IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
   authorization:=gen_random_uuid();
   INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,existing.decision_id,'approved',actor.member_id);
   INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,amount_pence,currency,aggregate_revision,policy_version,expires_at)
    VALUES(authorization,t,existing.decision_id,resolution,actor.member_id,'success_fee.statement_approve',sid::text,digest,
     abs((existing.document->'documentPrincipal'->>'pence')::bigint),'GBP',(snapshot->>'postingRevision')::integer,'reference_fee_policy_v3',deadline);
  END IF;
 END IF;
 result:=jsonb_build_object('version','simulation-fee-statement-result.v1','commandId',cid,'statementId',sid,'documentHash',digest,'authorizationId',authorization,'replayed',false);
 INSERT INTO app.platform_fee_statement_command VALUES(t,p_job,cid,actor.member_id,p_command,result);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_fee_statement.'||action,
  jsonb_build_object('commandId',cid,'statementId',sid,'documentHash',digest,'authorizationId',authorization));
 RETURN result;
EXCEPTION WHEN deadlock_detected THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001';
END $$;
CREATE OR REPLACE FUNCTION app.write_platform_fee_collection(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE t uuid; actor record; c record; action text:=p_command->>'action'; cid uuid;
 prior app.platform_fee_collection_command; statement app.platform_fee_statement; attempt app.platform_fee_attempt;
 event app.platform_fee_attempt_event; snapshot jsonb; view jsonb; result jsonb; approval jsonb;
 aid uuid:=gen_random_uuid(); decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); authorization uuid:=gen_random_uuid();
 amount bigint; deadline timestamptz; next_state text;
BEGIN
 PERFORM app.read_success_fee_v3(p_job,p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job)
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM 'simulation-fee-collection-command.v1'
 OR action IS NULL OR action NOT IN('collect','refund','redirect','unknown','settle','fail')
 OR NOT(p_command ?& ARRAY['version','action','commandId']) OR NOT coalesce(pg_input_is_valid(p_command->>'commandId','uuid'),false)
 OR (action IN('collect','refund') AND (NOT(p_command ?& ARRAY['statementId','statementHash','amountPence'])
  OR NOT coalesce(pg_input_is_valid(p_command->>'statementId','uuid'),false) OR jsonb_typeof(p_command->'amountPence') IS DISTINCT FROM 'number' OR NOT coalesce(pg_input_is_valid(p_command->>'amountPence','bigint'),false)
  OR coalesce(p_command->>'statementHash','') !~ '^[a-f0-9]{64}$'
  OR p_command-ARRAY['version','action','commandId','statementId','statementHash','amountPence']<>'{}'))
 OR (action NOT IN('collect','refund') AND (NOT coalesce(pg_input_is_valid(p_command->>'attemptId','uuid'),false)
  OR p_command-ARRAY['version','action','commandId','attemptId']<>'{}'))
 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p_command->>'commandId')::uuid;
 LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE app.recovery_attribution_revision,app.recovery_attribution_command,
 app.stored_receipt_case_allocation,app.receipt_allocation_fact_source,
 app.receipt_allocation_fact_line,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_command,
 app.customer_payment_reversal,app.customer_credit_note,app.practice_feed_event,app.practice_feed_command,
 app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,
 app.recovery_case,app.recovery_claim_revision,app.recovery_case_event,
 app.recovery_case_allocation,app.recovery_case_allocation_reversal,app.receipt_line_allocation,
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
   VALUES(authorization,t,decision,resolution,actor.member_id,'success_fee.simulated_'||action,'fake-rail:'||aid::text,statement.document_hash,amount,'GBP',
    (statement.document->'sourceSnapshot'->>'postingRevision')::integer,'reference_fee_policy_v3',deadline);
  INSERT INTO app.platform_fee_attempt VALUES(t,p_job,aid,statement.id,authorization,CASE WHEN action='collect' THEN 'collection' ELSE 'refund' END,amount);
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
CREATE OR REPLACE FUNCTION app.simulation_money_run(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record; availability jsonb; action text:=p_command->>'action'; cid uuid;
 r app.simulation_money_run; review app.simulation_money_review; source jsonb; digest text;
BEGIN
 availability:=app.read_success_fee_v3(p_job,p_session);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 -- This branch precedes all hidden-source reads, even for supplied run IDs.
 IF availability->>'state'<>'catch_review_available' THEN
  RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000';
 END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM 'simulation-money-command.v1'
 OR action IS NULL OR action NOT IN('run','read','review','restore')
 OR NOT coalesce(pg_input_is_valid(p_command->>'commandId','uuid'),false)
 OR (p_command - (CASE WHEN action='run' THEN ARRAY['version','action','commandId'] ELSE ARRAY['version','action','commandId','runId','sourceHash'] END))<>'{}'
 OR (action<>'run' AND (NOT coalesce(pg_input_is_valid(p_command->>'runId','uuid'),false) OR coalesce(p_command->>'sourceHash','') !~ '^[a-f0-9]{64}$'))
 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- Synthetic coarse fence: all source writers finish before snapshot collection.
 -- All business locks are acquired before the audit head. No provider call.
 LOCK TABLE app.customer_invoice,app.customer_credit_note,app.customer_payment,app.customer_payment_reversal,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_source,app.receipt_allocation_fact_line,app.stored_receipt_case_allocation,app.success_fee_derivation,app.success_fee_journal,app.success_fee_journal_line,app.platform_fee_statement,app.platform_fee_attempt,app.platform_fee_attempt_event,app.subscription_period,app.subscription_period_line,app.platform_statement,app.platform_statement_line,app.subscription_simulated_work,app.subscription_simulated_result,app.action_authorization,app.recovery_attribution_revision,app.recovery_attribution_command,app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,app.recovery_case,app.recovery_claim_revision,app.recovery_case_event,app.practice_feed_event,app.practice_feed_command,app.practice_feed_receipt_match, app.recovery_case_allocation,app.recovery_case_allocation_reversal,app.receipt_line_allocation,
 app.recovery_allocation_command,app.recovery_allocation_review,app.recovery_eligibility_revision,
 app.recovery_case_terms_approval,app.evidence_object,
 app.job_party_binding,app.job_party_current,app.evidence_upload,app.recovery_payment_payer_mark IN SHARE MODE;
 PERFORM pg_advisory_xact_lock(hashtextextended('simulation-money:'||t::text,0));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,action<>'read');
 PERFORM app.read_success_fee_v3(p_job,p_session);
 IF (action='review' AND EXISTS(SELECT 1 FROM app.simulation_money_run WHERE tenant_id=t AND id=cid))
 OR (action IN('run','restore') AND EXISTS(SELECT 1 FROM app.simulation_money_review WHERE tenant_id=t AND id=cid))
 THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
 IF action='review' THEN
  SELECT * INTO review FROM app.simulation_money_review WHERE tenant_id=t AND id=cid;
  IF FOUND THEN
   IF review.job_id<>p_job OR review.actor_membership_id<>actor.member_id OR review.request<>p_command
   THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  SELECT * INTO r FROM app.simulation_money_run WHERE tenant_id=t AND id=cid;
  IF FOUND AND action<>'read' THEN
   IF r.job_id<>p_job OR r.actor_membership_id<>actor.member_id OR r.request<>p_command
   THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
   RETURN jsonb_build_object('runId',r.id,'jobId',p_job,'sourceHash',r.source_hash,'snapshot',r.snapshot,'paused',true);
  END IF;
 END IF;
 IF action<>'run' THEN
  SELECT * INTO r FROM app.simulation_money_run WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'runId')::uuid;
  IF r.id IS NULL OR r.source_hash<>p_command->>'sourceHash'
  THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF action='review' AND review.id IS NULL THEN
   source:=app.simulation_money_sources(t,p_job,actor.member_id);
   IF app.final_lock_hash(source)<>r.source_hash THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
   INSERT INTO app.simulation_money_review VALUES(t,p_job,cid,r.id,actor.member_id,p_command);
   PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_money.review',jsonb_build_object('runId',r.id,'sourceHash',r.source_hash));
  END IF;
  -- Restore verifies the checkpoint, retains its exact rows and starts paused.
  -- It cannot execute queued money work or turn a review into a settlement.
  IF action IN('read','review') THEN
   RETURN jsonb_build_object('runId',r.id,'jobId',p_job,'sourceHash',r.source_hash,'snapshot',r.snapshot,'paused',true);
  END IF;
 END IF;
 source:=app.simulation_money_sources(t,p_job,actor.member_id); digest:=app.final_lock_hash(source);
 IF action='restore' AND digest<>r.source_hash THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 INSERT INTO app.simulation_money_run VALUES(t,p_job,cid,actor.member_id,p_command,source,digest);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_money.'||action,jsonb_build_object('runId',cid,'sourceHash',digest));
 RETURN jsonb_build_object('runId',cid,'jobId',p_job,'sourceHash',digest,'snapshot',source,'paused',true);
END $$;
COMMIT;
