BEGIN;
-- M4-9-S RED. Expand the existing private source ledger; no new ACLs or routines.
-- Forward fix only: immutable predecessor facts and v1 accounting stay untouched.
ALTER TABLE app.success_fee_derivation DROP CONSTRAINT success_fee_derivation_delta_pence_check;
ALTER TABLE app.success_fee_derivation ADD CHECK(delta_pence BETWEEN -1000000000000 AND 1000000000000);
ALTER TABLE app.success_fee_source DROP CONSTRAINT success_fee_source_pkey;
ALTER TABLE app.success_fee_source ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE app.success_fee_source ADD PRIMARY KEY(tenant_id,id);
ALTER TABLE app.success_fee_source ADD UNIQUE(tenant_id,derivation_id,allocation_id);
ALTER TABLE app.success_fee_source ADD COLUMN recovery_allocation_id uuid;
ALTER TABLE app.success_fee_source ADD UNIQUE(tenant_id,derivation_id,recovery_allocation_id);
ALTER TABLE app.success_fee_source ADD FOREIGN KEY(tenant_id,job_id,recovery_allocation_id)
 REFERENCES app.recovery_case_allocation(tenant_id,job_id,id);
ALTER TABLE app.success_fee_source ADD FOREIGN KEY(tenant_id,job_id,case_id)
 REFERENCES app.recovery_case(tenant_id,job_id,id);
ALTER TABLE app.success_fee_source ALTER COLUMN allocation_id DROP NOT NULL;
ALTER TABLE app.success_fee_source ALTER COLUMN assessment_id DROP NOT NULL;
ALTER TABLE app.success_fee_source ALTER COLUMN work_id DROP NOT NULL;
ALTER TABLE app.success_fee_source ALTER COLUMN line_id DROP NOT NULL;
ALTER TABLE app.success_fee_source ALTER COLUMN lock_id DROP NOT NULL;
ALTER TABLE app.success_fee_source ADD CHECK(
 (recovery_allocation_id IS NULL AND allocation_id IS NOT NULL AND assessment_id IS NOT NULL AND work_id IS NOT NULL AND line_id IS NOT NULL AND lock_id IS NOT NULL)
 OR (recovery_allocation_id IS NOT NULL AND allocation_id IS NULL AND assessment_id IS NULL AND work_id IS NULL AND line_id IS NULL AND lock_id IS NULL));
ALTER TABLE app.success_fee_journal DROP CONSTRAINT success_fee_journal_tenant_id_derivation_id_key;
CREATE UNIQUE INDEX success_fee_positive_derivation ON app.success_fee_journal(tenant_id,derivation_id) WHERE amount_pence>0;
CREATE UNIQUE INDEX success_fee_compensation_original ON app.success_fee_journal(tenant_id,derivation_id,reverses_journal_id) WHERE amount_pence<0;
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
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_journal_line l WHERE l.tenant_id=t AND l.journal_id=j AND l.account='fee_income' AND l.side=(CASE WHEN n>0 THEN 'credit' ELSE 'debit' END))
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_derivation d WHERE d.tenant_id=t AND d.id=NEW.derivation_id AND d.job_id=NEW.job_id AND (CASE WHEN n>0 THEN d.delta_pence=n ELSE d.delta_pence<0 END))
 OR (n<0 AND NOT EXISTS(SELECT 1 FROM app.success_fee_journal original
  WHERE original.tenant_id=t AND original.job_id=NEW.job_id AND original.id=NEW.reverses_journal_id AND original.amount_pence>0
   AND original.amount_pence+(SELECT sum(r.amount_pence) FROM app.success_fee_journal r WHERE r.tenant_id=t AND r.job_id=NEW.job_id AND r.reverses_journal_id=original.id)>=0))
 OR (n<0 AND NOT EXISTS(SELECT 1 FROM app.success_fee_derivation d JOIN app.success_fee_review v
  ON(v.tenant_id,v.job_id,v.id)=(d.tenant_id,d.job_id,d.review_id)
  CROSS JOIN LATERAL jsonb_array_elements(v.statement->'compensationLinks') link
  WHERE d.tenant_id=t AND d.id=NEW.derivation_id AND (link->>'journalId')::uuid=NEW.reverses_journal_id
   AND (link->>'amountPence')::bigint=-n))
 THEN RAISE EXCEPTION 'SUCCESS_FEE_JOURNAL_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.check_success_fee_journal() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.check_success_fee_journal() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
CREATE OR REPLACE FUNCTION app.check_success_fee_derivation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n integer; amount numeric;
BEGIN
 SELECT count(*),coalesce(sum(amount_pence),0) INTO n,amount FROM app.success_fee_journal
  WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND derivation_id=NEW.id;
 IF NEW.fee_pence<>app.ef_round_half_even(NEW.qualifying_numerator::numeric,NEW.qualifying_denominator::numeric*10)
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND derivation_id=NEW.id)
 OR (CASE WHEN NEW.delta_pence=0 THEN n<>0 WHEN NEW.delta_pence>0 THEN n<>1 ELSE n<1 END) OR amount<>NEW.delta_pence
 OR NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution r
  ON(r.tenant_id,r.id,r.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.authorization_id AND a.action_type='success_fee.post'
   AND a.content_hash=NEW.statement_hash AND a.amount_pence=abs(NEW.delta_pence) AND a.currency='GBP'
   AND a.aggregate_revision=NEW.revision-1 AND a.policy_version='reference_fee_policy_v3' AND r.resolution='approved')
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DERIVATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.check_success_fee_derivation() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.check_success_fee_derivation() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
CREATE OR REPLACE FUNCTION app.write_success_fee_v3(p_job uuid,p_session text,p_command jsonb,p_artifact jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record; c record; a record; approval app.action_authorization;
 prior app.success_fee_command; saved app.success_fee_review; live jsonb; selection jsonb;
 sources jsonb:='[]'; parts jsonb:='[]'; statement jsonb; result jsonb; pair numeric[];
 posting_revision integer; posted bigint; fee bigint; delta bigint; deadline timestamptz; source_deadline timestamptz;
 cid uuid; rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); jid uuid;
 decision uuid:=gen_random_uuid(); resolution uuid:=gen_random_uuid(); authorization uuid:=gen_random_uuid();
 rc app.recovery_case_current; landing app.recovery_case_allocation; eligibility app.recovery_eligibility_revision;
 proof app.evidence_object; movement app.practice_feed_event; terms app.recovery_case_terms_approval;
 reversals jsonb; remaining bigint; reversed_net bigint; reversed_gross bigint;
 links jsonb:='[]'; link jsonb; outstanding bigint; original record; first_journal uuid;
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
 app.recovery_case,app.recovery_claim_revision,app.recovery_case_event,
 app.recovery_case_allocation,app.recovery_case_allocation_reversal,app.receipt_line_allocation,
 app.recovery_allocation_command,app.recovery_allocation_review,app.recovery_eligibility_revision,
 app.recovery_case_terms_approval,app.evidence_object,app.practice_feed_receipt_match,
 app.job_party_binding,app.job_party_current,app.evidence_upload,app.recovery_payment_payer_mark IN SHARE MODE;
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
 -- Builder-opened withheld-payment receipts use the existing M4-8-S allocator.
 -- Its approved case eligibility is not catch attribution and never bypasses it.
 FOR landing IN SELECT ca.* FROM app.recovery_case_allocation ca JOIN app.recovery_case source_case
  ON(source_case.tenant_id,source_case.job_id,source_case.id)=(ca.tenant_id,ca.job_id,ca.case_id)
  WHERE ca.tenant_id=t AND ca.job_id=p_job AND source_case.case_type='withheld_customer_payment' ORDER BY ca.id LOOP
  SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=p_job AND id=landing.case_id;
  SELECT * INTO eligibility FROM app.recovery_eligibility_revision WHERE tenant_id=t AND job_id=p_job AND case_id=landing.case_id ORDER BY revision DESC LIMIT 1;
  SELECT * INTO movement FROM app.practice_feed_event WHERE tenant_id=t AND job_id=p_job AND id=landing.movement_id;
  SELECT * INTO terms FROM app.recovery_case_terms_approval WHERE tenant_id=t AND job_id=p_job AND case_id=landing.case_id;
  SELECT e.* INTO proof FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
   WHERE e.tenant_id=t AND e.job_id=p_job AND e.id=landing.evidence_id AND e.kind='original'
    AND (e.object_version_id,e.sha256,e.server_received_at)=(landing.object_version_id,landing.evidence_hash,landing.evidence_server_received_at)
    AND e.server_verified_at IS NOT NULL AND u.state='verified';
  IF NOT rc.synthetic OR rc.state='prevented' OR rc.claim_revision IS NULL OR rc.book<>'builder_customer'
   OR eligibility.id IS NULL OR eligibility.status<>'approved' OR eligibility.classification<>'eligible_for_review'
   OR proof.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=proof.id)
   OR movement.id IS NULL OR movement.state<>'settled' OR movement.identity<>'identified'
   OR movement.source_hash<>landing.movement_hash OR movement.created_at<=rc.created_at
   OR terms.id IS NULL OR terms.approved_at>movement.created_at
   OR NOT EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=t AND a.id=terms.authorization_id AND a.revoked_at IS NULL)
   OR coalesce(app.recovery_job_payer_type(t,p_job),'unknown')='insurer'
   OR NOT rc.source_refs ? landing.invoice_id::text
   OR NOT EXISTS(SELECT 1 FROM app.practice_feed_receipt_match m JOIN app.customer_payment p
    ON(p.tenant_id,p.job_id,p.id)=(m.tenant_id,m.job_id,m.payment_id)
    WHERE m.tenant_id=t AND m.job_id=p_job AND m.payment_id=landing.payment_id AND p.invoice_id=landing.invoice_id
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
   WHERE r.tenant_id=t AND r.job_id=p_job AND r.allocation_id=landing.id;
  IF reversed_net>landing.eligible_net_pence OR reversed_gross>landing.gross_pence
   OR EXISTS(SELECT 1 FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=p_job AND r.allocation_id=landing.id
    AND NOT EXISTS(SELECT 1 FROM app.recovery_allocation_command cmd JOIN app.action_authorization auth
     ON(auth.tenant_id,auth.id)=(r.tenant_id,r.authorization_id)
     JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(auth.tenant_id,auth.resolution_id,auth.decision_id)
     WHERE cmd.tenant_id=t AND cmd.job_id=p_job AND cmd.command_id=r.command_id AND cmd.payload->>'action'='reverse'
      AND cmd.result->>'allocationId'=landing.id::text AND auth.action_type='recovery_allocation.reverse'
      AND auth.revoked_at IS NULL AND dr.resolution='approved' AND auth.amount_pence=r.gross_pence))
   OR (EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=p_job AND payment_id=landing.payment_id)
    AND reversed_gross<>landing.gross_pence)
   OR EXISTS(SELECT 1 FROM app.customer_credit_note cn WHERE cn.tenant_id=t AND cn.job_id=p_job AND cn.invoice_id=landing.invoice_id
    AND NOT EXISTS(SELECT 1 FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=p_job AND r.allocation_id=landing.id AND r.credit_note_id=cn.id))
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  remaining:=landing.eligible_net_pence-reversed_net;
  IF (SELECT coalesce(sum(ca.eligible_net_pence),0) FROM app.recovery_case_allocation ca WHERE ca.tenant_id=t AND ca.job_id=p_job AND ca.case_id=landing.case_id)>least(rc.claim_pence,eligibility.eligible_net_pence)
   OR (SELECT coalesce(sum(ca.gross_pence),0) FROM app.recovery_case_allocation ca WHERE ca.tenant_id=t AND ca.job_id=p_job AND ca.payment_id=landing.payment_id)>movement.gross_pence
  THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
  IF jsonb_array_length(sources)>=10000 THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
  parts:=parts||jsonb_build_array(jsonb_build_array(remaining::text,'1'));
  sources:=sources||jsonb_build_array(jsonb_build_object('caseId',landing.case_id,'recoveryAllocationId',landing.id,
   'reviewAuthorizationId',approval.id,'sourceHash',app.final_lock_hash(jsonb_build_object(
    'allocation',to_jsonb(landing),'reversals',reversals,'eligibility',to_jsonb(eligibility),'caseRevision',rc.revision,
    'terms',terms.id,'movement',to_jsonb(movement),'proof',to_jsonb(proof)))));
 END LOOP;
 IF sources='[]'::jsonb THEN RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 pair:=app.recovery_allocation_fraction_sum(parts);
 fee:=app.ef_round_half_even(pair[1],pair[2]*10); delta:=fee-posted;
 -- Bind compensation to immutable positive journals, newest first. A full
 -- reversal may span several postings; never over-compensate any original.
 outstanding:=-delta;
 IF delta<0 THEN
  FOR original IN SELECT j.id,j.amount_pence+coalesce((SELECT sum(r.amount_pence) FROM app.success_fee_journal r
   WHERE r.tenant_id=t AND r.job_id=p_job AND r.reverses_journal_id=j.id),0) available
   FROM app.success_fee_journal j JOIN app.success_fee_derivation d ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id)
   WHERE j.tenant_id=t AND j.job_id=p_job AND j.amount_pence>0 ORDER BY d.revision DESC,j.id LOOP
   IF original.available>0 AND outstanding>0 THEN
    remaining:=least(original.available,outstanding);
    links:=links||jsonb_build_array(jsonb_build_object('journalId',original.id,'amountPence',remaining));
    outstanding:=outstanding-remaining;
   END IF;
  END LOOP;
  IF outstanding<>0 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 END IF;
 IF fee>1000000000000 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 statement:=jsonb_build_object('version','success-fee-statement.v1','jobId',p_job,'policyVersion','reference_fee_policy_v3',
  'roundingPolicy','commercial_half_even.v1','qualifyingPrincipal',jsonb_build_object('numerator',trunc(pair[1])::text,'denominator',trunc(pair[2])::text),
  'feePence',fee,'priorPence',posted,'deltaPence',delta,'expectedPostingRevision',posting_revision,'sources',sources,
  'environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
 IF delta<0 THEN statement:=statement||jsonb_build_object('compensationLinks',links); END IF;
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
   VALUES(authorization,t,decision,resolution,actor.member_id,'success_fee.post','jobguard:synthetic_fee_ledger',digest,abs(delta),'GBP',posting_revision,'reference_fee_policy_v3',least(deadline,saved.expires_at));
  INSERT INTO app.success_fee_derivation(tenant_id,job_id,id,review_id,revision,authorization_id,qualifying_numerator,qualifying_denominator,fee_pence,prior_pence,delta_pence,statement_hash)
   VALUES(t,p_job,did,rid,posting_revision+1,authorization,trunc(pair[1])::text,trunc(pair[2])::text,fee,posted,delta,digest);
  INSERT INTO app.success_fee_source(tenant_id,job_id,derivation_id,assessment_id,allocation_id,review_authorization_id,case_id,work_id,line_id,lock_id)
   SELECT t,p_job,did,(s->>'assessmentId')::uuid,x::uuid,(s->>'reviewAuthorizationId')::uuid,ar.case_id,ar.work_id,ar.line_id,ar.lock_id
   FROM jsonb_array_elements(sources) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'allocationIds') x
   JOIN app.recovery_attribution_revision ar ON ar.tenant_id=t AND ar.id=(s->>'assessmentId')::uuid WHERE s ? 'assessmentId';
  INSERT INTO app.success_fee_source(tenant_id,job_id,derivation_id,recovery_allocation_id,review_authorization_id,case_id)
   SELECT t,p_job,did,(s->>'recoveryAllocationId')::uuid,(s->>'reviewAuthorizationId')::uuid,(s->>'caseId')::uuid
   FROM jsonb_array_elements(sources) s WHERE s ? 'recoveryAllocationId';
  IF delta>0 THEN
   jid:=gen_random_uuid();
   INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency) VALUES(t,p_job,jid,did,delta,'GBP');
   INSERT INTO app.success_fee_journal_line(tenant_id,job_id,journal_id,account,side,amount_pence)
    VALUES(t,p_job,jid,'fee_receivable','debit',delta),(t,p_job,jid,'fee_income','credit',delta);
  END IF;
  IF delta<0 THEN
   FOR link IN SELECT value FROM jsonb_array_elements(links) LOOP
    jid:=gen_random_uuid(); first_journal:=coalesce(first_journal,jid);
    remaining:=(link->>'amountPence')::bigint;
    INSERT INTO app.success_fee_journal(tenant_id,job_id,id,derivation_id,amount_pence,currency,reverses_journal_id)
     VALUES(t,p_job,jid,did,-remaining,'GBP',(link->>'journalId')::uuid);
    INSERT INTO app.success_fee_journal_line(tenant_id,job_id,journal_id,account,side,amount_pence)
     VALUES(t,p_job,jid,'fee_receivable','credit',remaining),(t,p_job,jid,'fee_income','debit',remaining);
   END LOOP;
   jid:=first_journal;
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
