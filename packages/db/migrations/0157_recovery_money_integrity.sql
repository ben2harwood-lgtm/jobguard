BEGIN;
-- MIGFIX-6 (0157): recovery money integrity. Three named parts that never share a formula:
--   (1) legacy derivation  - app.approve_synthetic_landing / app.reverse_synthetic_landing (0018/0097, reference v1);
--   (2) current allocator  - app.write_recovery_allocation (0136) and its private invoice-line composition helper;
--   (3) component settlement - the F18 eligibility guard and deferred effect (0142 restatement of 0119/0130).
-- No table, column, grant, policy or fingerprint-protected row shape changes. One bound is added to landing_allocation
-- (a CHECK); if historical bad rows existed it would fail loudly rather than normalize commercial history.

-- (1a) Eligible principal can never exceed the cash it was allocated from.
ALTER TABLE app.landing_allocation ADD CONSTRAINT landing_allocation_eligible_within_gross CHECK(eligible_net_pence<=gross_pence);
-- (1b) Restates 0097 exactly except the eligible<=gross refusal in the existing allocation-bound check.
CREATE OR REPLACE FUNCTION app.approve_synthetic_landing(p jsonb)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c app.recovery_case_current;r app.synthetic_recovery_receipt;e app.evidence_object;a app.recovery_approval;l uuid:=(p->>'allocationId')::uuid;d uuid:=(p->>'derivationId')::uuid;j uuid:=(p->>'journalId')::uuid;gross bigint:=(p->>'grossPence')::bigint;eligible bigint:=(p->>'eligibleNetPence')::bigint;landed bigint;reversed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;
BEGIN
 IF t IS NULL OR p->>'version'<>'recovery.landing.approve.v1' OR p->>'policyVersion'<>'reference_fee_policy_v1' THEN RAISE EXCEPTION 'synthetic reference command required' USING ERRCODE='42501';END IF;
 -- Lock order (shared with the workbench, which holds only the case advisory key and
 -- cannot lock job rows as a non-owner): case advisory key, then job row, then case row.
 -- Taking the advisory key first means a workbench write to this case (which holds the
 -- key before its foreign-key share locks on job/case rows) can never wait on this
 -- routine while this routine waits on it. Read the projection only after the locks.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(((p->>'caseId')::uuid)::text));
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=(p->>'jobId')::uuid FOR UPDATE;
 PERFORM 1 FROM app.recovery_case WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'caseId')::uuid FOR UPDATE;
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'caseId')::uuid;
 SELECT * INTO r FROM app.synthetic_recovery_receipt WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'receiptId')::uuid FOR UPDATE;
 SELECT * INTO e FROM app.evidence_object WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'evidenceId')::uuid AND kind='original';
 IF c.id IS NULL OR NOT c.synthetic OR c.state='prevented' OR c.revision<>(p->>'expectedCaseRevision')::integer THEN RAISE EXCEPTION 'eligible current synthetic case required' USING ERRCODE='42501';END IF;
 IF r.id IS NULL OR NOT r.synthetic OR r.status<>'settled' THEN RAISE EXCEPTION 'settled synthetic receipt required' USING ERRCODE='42501';END IF;
 IF e.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=t AND x.evidence_id=e.id) THEN RAISE EXCEPTION 'verified current evidence required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app.recovery_approval WHERE tenant_id=t AND id=(p->>'eligibilityApprovalId')::uuid AND job_id=c.job_id AND case_id=c.id AND kind='eligibility';
 IF a.id IS NULL OR a.status<>'approved' OR a.policy_version<>'reference_fee_policy_v1' OR a.expected_case_revision<>c.revision OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'current eligibility approval required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app.recovery_approval WHERE tenant_id=t AND id=(p->>'landingApprovalId')::uuid AND job_id=c.job_id AND case_id=c.id AND kind='landing';
 IF a.id IS NULL OR a.status<>'approved' OR a.expected_case_revision<>c.revision OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'current landing approval required' USING ERRCODE='42501';END IF;
 IF gross<=0 OR eligible<=0 OR eligible>gross OR (SELECT COALESCE(sum(gross_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND receipt_id=r.id)+gross>r.gross_pence OR c.approved_landed+eligible>c.claim_pence-c.written_off THEN RAISE EXCEPTION 'allocation exceeds available receipt or claim' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_allocation VALUES(l,t,c.job_id,c.id,r.id,e.id,(p->>'eligibilityApprovalId')::uuid,(p->>'landingApprovalId')::uuid,gross,eligible,'GBP','reference_fee_policy_v1',DEFAULT);
 SELECT COALESCE(sum(x.eligible_net_pence),0),COALESCE((SELECT sum(y.eligible_net_pence)FROM app.landing_reversal y WHERE y.tenant_id=t AND y.job_id=c.job_id),0)INTO landed,reversed FROM app.landing_allocation x WHERE x.tenant_id=t AND x.job_id=c.job_id;
 landed:=landed-reversed;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=c.job_id AND fee_policy_version='reference_fee_policy_v1';
 IF cap IS NULL OR (SELECT mode FROM app.job_activation WHERE tenant_id=t AND job_id=c.job_id)<>'synthetic_demo' THEN RAISE EXCEPTION 'production and pilot fee posting disabled' USING ERRCODE='0A000';END IF;
 fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=c.job_id)THEN 7900 ELSE 0 END,fee);liability:=fee-credit;
 SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=c.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(d,t,c.job_id,l,NULL,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);
 IF delta>0 THEN INSERT INTO app.recovery_fee_journal VALUES(j,t,c.job_id,d,'fee_obligation',delta,'GBP','recovery_fee_receivable','recovery_fee_deferred',NULL,DEFAULT);END IF;
 RETURN d;
END$$;

-- (1c) A reversal recomputes the CUMULATIVE position of the job (every allocation less every reversal, including this one)
-- and derives plan credit exactly as the approval routine does: only from a settled v1 plan fee. It never invents credit.
CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing(p_tenant uuid,p_reversal uuid,p_derivation uuid,p_journal uuid,p_allocation uuid,p_amount bigint,p_reason varchar)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;x app.landing_allocation;landed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;original uuid;
BEGIN IF t IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501';END IF;SELECT*INTO x FROM app.landing_allocation WHERE tenant_id=t AND id=p_allocation FOR UPDATE;PERFORM 1 FROM app.job WHERE tenant_id=t AND id=x.job_id FOR UPDATE;
 IF x.id IS NULL OR p_amount<=0 OR p_amount>x.eligible_net_pence OR EXISTS(SELECT 1 FROM app.landing_reversal WHERE tenant_id=t AND allocation_id=x.id)THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_reversal VALUES(p_reversal,t,x.job_id,x.id,p_amount,p_reason,DEFAULT);
 SELECT COALESCE(sum(a.eligible_net_pence),0)-COALESCE((SELECT sum(r.eligible_net_pence) FROM app.landing_reversal r WHERE r.tenant_id=t AND r.job_id=x.job_id),0) INTO landed FROM app.landing_allocation a WHERE a.tenant_id=t AND a.job_id=x.job_id;
 SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=x.job_id;
 IF cap IS NULL THEN RAISE EXCEPTION 'production and pilot fee posting disabled' USING ERRCODE='0A000';END IF;
 fee:=least(app.half_even_ratio(landed,1,10),cap);
 credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=x.job_id)THEN 7900 ELSE 0 END,fee);
 liability:=fee-credit;SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(p_derivation,t,x.job_id,NULL,p_reversal,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);INSERT INTO app.recovery_review VALUES(gen_random_uuid(),t,x.job_id,p_derivation,'landing_reversed','open',DEFAULT);
 IF delta<0 THEN SELECT id INTO original FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id AND kind='fee_obligation' ORDER BY created_at LIMIT 1;INSERT INTO app.recovery_fee_journal VALUES(p_journal,t,x.job_id,p_derivation,'compensation',-delta,'GBP','recovery_fee_deferred','recovery_fee_receivable',original,DEFAULT);END IF;RETURN p_derivation;END$$;

-- (2a) Private composition helper for the allocator. For an invoice that has real issued-line facts
-- (app.final_account_invoiced_line, written by the lock-bound issuer) the composition is exactly those lines with their saved
-- gross. For a legacy invoice the composition is the account revision's positive lines with the issuer's display allocation:
-- the invoice's one group tax is shared by largest remainder over line net (ties by line id), so every line gross is a whole
-- number of pence. A line gross is never manufactured as net x invoice ratio. Runtime has no EXECUTE; only the definer reads it.
CREATE FUNCTION app.recovery_allocation_invoice_lines(p_tenant uuid,p_job uuid,p_invoice uuid)
 RETURNS TABLE(line_id uuid,net_pence bigint,gross_pence bigint,supplementary boolean)
 LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 WITH issued AS (
  SELECT l.final_account_line_id line_id,l.net_pence,l.gross_pence,coalesce(b.invoice_kind='supplementary',false) supplementary
  FROM app.final_account_invoiced_line l JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(l.tenant_id,l.job_id,l.invoice_id)
  WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.invoice_id=p_invoice AND l.net_pence>0),
 raw AS (
  SELECT l.id line_id,l.net_pence,i.tax_pence,i.net_pence invoice_net,
   floor(i.tax_pence::numeric*l.net_pence/i.net_pence) base,mod(i.tax_pence::numeric*l.net_pence,i.net_pence::numeric) remainder
  FROM app.customer_invoice i JOIN app.final_account_line l ON(l.tenant_id,l.job_id,l.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
  WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND i.id=p_invoice AND l.net_pence>0 AND i.net_pence>0
  AND NOT EXISTS(SELECT 1 FROM issued)),
 ranked AS (SELECT *,row_number() OVER(ORDER BY remainder DESC,line_id::text COLLATE "C") AS rank_position,tax_pence-sum(base) OVER() leftover FROM raw)
 SELECT line_id,net_pence,gross_pence,supplementary FROM issued
 UNION ALL
 SELECT line_id,net_pence,(net_pence+base+CASE WHEN rank_position<=leftover THEN 1 ELSE 0 END)::bigint,false FROM ranked
$$;
ALTER FUNCTION app.recovery_allocation_invoice_lines(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_allocation_invoice_lines(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- (2b) Restates 0136 write_recovery_allocation (same signature, owner and grants) with the repairs named above.
CREATE OR REPLACE FUNCTION app.write_recovery_allocation(p_tenant uuid,p_job uuid,p_session text,p_command jsonb,p_artifact jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record; c app.recovery_case_current; m record; inv app.customer_invoice; ev app.evidence_object;
 eligibility app.recovery_eligibility_revision; original app.recovery_case_allocation; review app.recovery_allocation_review;
 command_row app.recovery_allocation_command; cid uuid; pid uuid; aid uuid; rid uuid; did uuid; resolution_id uuid; auth_id uuid;
 action text:=p_command->>'action'; amount bigint:=(p_command->>'grossPence')::bigint;
 net bigint:=(p_artifact->>'eligibleNetPence')::bigint; tax bigint:=(p_artifact->>'taxPence')::bigint;
 available bigint; source_id uuid; source_kind text; line jsonb; binding jsonb; source_binding uuid;
 lf record; prior_line app.receipt_line_allocation; remittance jsonb; remittance_ev app.evidence_object; share jsonb;
 hash text; result jsonb; is_separate boolean:=false; used_pair numeric[]; balance_pair numeric[]; total_pair numeric[]:=ARRAY[0::numeric,1::numeric]; given_pair numeric[]:=ARRAY[0::numeric,1::numeric]; balances jsonb:='{}'; 
 gn numeric; gd numeric; nn numeric; nd numeric; direction integer; source_bytes bytea; keyword bytea:=decode('6a6f6267756172642d72656d697474616e636500','hex');
 png_prefix bytea:=decode('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63686868f80f00058402808ccd6626','hex'); content_bytes bytea; content_offset integer;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM (CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN nullif(current_setting('app.tenant_id',true),'')::uuid END)
 OR current_setting('app.recovery_allocation_environment',true) IS DISTINCT FROM 'synthetic_demo'
 OR p_command->>'version' IS DISTINCT FROM 'recovery-allocation-command.v1' OR p_artifact->>'version' IS DISTINCT FROM 'recovery-allocation-artifact.v1'
 OR action NOT IN('review','allocate','review_reverse','reverse') OR amount IS NULL OR amount<=0 OR amount>1000000000000 THEN
  RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Reversal lookup touches only our own allocation; the canonical case key precedes ALL job/case access.
 IF action IN('review_reverse','reverse') THEN
  SELECT * INTO original FROM app.recovery_case_allocation WHERE tenant_id=p_tenant AND job_id=p_job AND id=(p_command->>'allocationId')::uuid;
  IF original.id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING ERRCODE='23514'; END IF;
  cid:=original.case_id; pid:=original.payment_id;
 ELSE cid:=(p_command->>'caseId')::uuid;pid:=(p_command->>'paymentId')::uuid; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext(cid::text));
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session,p_tenant);
 IF actor.membership_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=p_tenant AND id=actor.membership_id AND identity_user_id=actor.identity_user_id
 AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO command_row FROM app.recovery_allocation_command WHERE tenant_id=p_tenant AND command_id=(p_command->>'commandId')::uuid;
 IF command_row.command_id IS NOT NULL THEN
  IF command_row.job_id<>p_job OR command_row.payload<>p_command OR command_row.actor_membership_id<>actor.membership_id THEN
   RAISE EXCEPTION 'ALLOCATION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN command_row.result||jsonb_build_object('replayed',true);
 END IF;
 -- Keep the merged public caller shape: the case key precedes parent FK KEY SHARE locks.
 -- No explicit parent row lock is needed; same-case v1 callers cannot pass that key.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND practice_session_digest=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||pid::text,0));
 PERFORM app.lock_recovery_message_sources(p_tenant);
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=p_tenant AND job_id=p_job AND id=cid;
 IF c.id IS NULL OR c.state='prevented' OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.revision<>(p_command->>'expectedCaseRevision')::integer THEN RAISE EXCEPTION 'ALLOCATION_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 SELECT p.invoice_id,e.id movement_id,e.source_hash,e.account_id,e.event_id,e.created_at,match_row.matched_pence INTO m
 FROM app.customer_payment p JOIN app.practice_feed_receipt_match match_row ON(match_row.tenant_id,match_row.job_id,match_row.payment_id)=(p.tenant_id,p.job_id,p.id)
 JOIN app.practice_feed_event e ON(e.tenant_id,e.account_id,e.event_id)=(match_row.tenant_id,match_row.account_id,match_row.settled_event_id)
 WHERE p.tenant_id=p_tenant AND p.job_id=p_job AND p.id=pid AND e.job_id=p_job AND e.state='settled' AND e.identity='identified'
 AND e.gross_pence=match_row.matched_pence AND p.amount_pence=match_row.matched_pence
 AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.state='possible_duplicate'
 AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command rc WHERE rc.tenant_id=u.tenant_id AND rc.account_id=u.account_id AND rc.movement_key=u.movement_key AND rc.action='reconcile_duplicate'));
 IF m.movement_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a JOIN app.practice_feed_event e ON(e.tenant_id,e.id)=(a.tenant_id,a.movement_id) WHERE a.tenant_id=p_tenant AND a.invoice_id=m.invoice_id AND e.created_at>m.created_at) THEN RAISE EXCEPTION 'ALLOCATION_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=m.invoice_id;
 SELECT * INTO eligibility FROM app.recovery_eligibility_revision WHERE tenant_id=p_tenant AND job_id=p_job AND case_id=cid ORDER BY revision DESC LIMIT 1;
 SELECT e.* INTO ev FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=CASE WHEN original.id IS NULL THEN (p_command->>'evidenceId')::uuid ELSE original.evidence_id END AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified';
 IF ev.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=p_tenant AND x.evidence_id=ev.id) AND original.id IS NULL THEN
  RAISE EXCEPTION 'ALLOCATION_EVIDENCE_HELD' USING ERRCODE='23514'; END IF;
 -- Eligibility approved before a claim amendment is stale: its case revision must reach the revision created by the latest amendment.
 IF original.id IS NULL AND(eligibility.id IS NULL OR eligibility.status<>'approved' OR eligibility.classification<>'eligible_for_review'
 OR eligibility.case_revision<c.claim_revision+coalesce((SELECT max(sequence) FROM app.recovery_case_event WHERE tenant_id=p_tenant AND case_id=cid AND event_type='claim_amended'),0)) THEN RAISE EXCEPTION 'ALLOCATION_EVIDENCE_HELD' USING ERRCODE='23514'; END IF;
 -- A recorded, still-current explicit remittance for this receipt is the fixed-priority source: a later command cannot omit it and fall to pro-rata.
 IF original.id IS NULL AND NOT(p_command ? 'remittanceEvidenceId') AND EXISTS(SELECT 1 FROM app.recovery_allocation_review rv WHERE rv.tenant_id=p_tenant AND rv.job_id=p_job AND rv.payment_id=pid AND rv.action='allocate'
  AND rv.artifact->>'remittanceEvidenceId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=rv.tenant_id AND x.evidence_id=(rv.artifact->>'remittanceEvidenceId')::uuid))
 THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF p_artifact->>'caseId' IS DISTINCT FROM cid::text OR p_artifact->>'paymentId' IS DISTINCT FROM pid::text
 OR p_artifact->>'invoiceId' IS DISTINCT FROM inv.id::text OR p_artifact->>'movementId' IS DISTINCT FROM m.movement_id::text
 OR p_artifact->>'movementHash' IS DISTINCT FROM trim(m.source_hash) OR p_artifact->>'evidenceId' IS DISTINCT FROM ev.id::text
 OR p_artifact->>'evidenceHash' IS DISTINCT FROM trim(ev.sha256) OR p_artifact->>'objectVersionId' IS DISTINCT FROM ev.object_version_id
 OR(p_artifact->>'expectedCaseRevision')::integer IS DISTINCT FROM c.revision
 OR(p_artifact->>'grossPence')::bigint IS DISTINCT FROM amount OR net IS NULL OR net<=0 OR tax IS NULL OR tax<0 OR amount<>net+tax
 OR amount::numeric*inv.net_pence<>net::numeric*inv.total_pence
 OR (original.id IS NULL AND p_artifact->>'eligibilityId' IS DISTINCT FROM eligibility.id::text)
 OR p_artifact->>'policyVersion' IS DISTINCT FROM (CASE WHEN original.id IS NULL THEN eligibility.policy_version ELSE original.policy_version END) THEN
  RAISE EXCEPTION 'INVALID_CASE_SPLIT' USING ERRCODE='23514'; END IF;
 IF original.id IS NULL THEN
  IF NOT(c.source_refs ? inv.id::text) THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND payment_id=pid) THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  SELECT m.matched_pence-coalesce(sum(a.gross_pence-(SELECT coalesce(sum(r.gross_pence),0) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=a.tenant_id AND r.allocation_id=a.id)),0)
  INTO available FROM app.recovery_case_allocation a WHERE a.tenant_id=p_tenant AND a.payment_id=pid;
  IF amount>available THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF net>c.claim_pence-c.landed-c.written_off THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_CLAIM' USING ERRCODE='23514'; END IF;
  IF net>eligibility.eligible_net_pence-c.landed THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_EVIDENCE' USING ERRCODE='23514'; END IF;
  direction:=1;
 ELSE
  SELECT original.gross_pence-coalesce(sum(gross_pence),0) INTO available FROM app.recovery_case_allocation_reversal WHERE tenant_id=p_tenant AND allocation_id=original.id;
  IF amount>available THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF p_command ? 'creditNoteId' THEN
   SELECT id INTO source_id FROM app.customer_credit_note WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND id=(p_command->>'creditNoteId')::uuid
   AND amount_pence>=(SELECT coalesce(sum(gross_pence),0)+amount FROM app.recovery_case_allocation_reversal WHERE tenant_id=p_tenant AND credit_note_id=(p_command->>'creditNoteId')::uuid);
   source_kind:='credit_note';
  ELSE SELECT id INTO source_id FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND job_id=p_job AND payment_id=pid;source_kind:='payment_reversal'; END IF;
  IF source_id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_REVERSAL_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  direction:=-1;
 END IF;
 IF p_artifact->>'action' IS DISTINCT FROM (CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END)
 OR p_artifact->>'allocationId' IS DISTINCT FROM original.id::text OR p_artifact->>'sourceId' IS DISTINCT FROM source_id::text
 OR p_artifact->>'sourceKind' IS DISTINCT FROM source_kind THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 -- Validate complete composition and immutable line bindings; arithmetic below checks kernel output by cross products.
 IF jsonb_typeof(p_artifact->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(p_artifact->'bindings') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_artifact->'bindings')<>(SELECT count(*) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id))
 OR jsonb_array_length(p_artifact->'bindings')>10000 OR jsonb_array_length(p_artifact->'lines')>jsonb_array_length(p_artifact->'bindings') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 is_separate:=coalesce((SELECT bool_or(h.supplementary) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id) h),false);
 FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
  SELECT l.*, (SELECT min(r.created_at) FROM app.final_account_line earlier JOIN app.final_account_revision r ON(r.tenant_id,r.id)=(earlier.tenant_id,earlier.final_account_revision_id)
   WHERE earlier.tenant_id=l.tenant_id AND earlier.job_id=l.job_id AND earlier.line_kind=l.line_kind AND earlier.source_id=l.source_id) existed_at INTO lf
  FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=inv.final_account_revision_id AND l.id=(binding->>'lineId')::uuid;
  IF lf.id IS NULL OR (binding->>'netPence')::bigint IS DISTINCT FROM lf.net_pence OR NOT EXISTS(SELECT 1 FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id) h WHERE h.line_id=lf.id AND h.net_pence=lf.net_pence AND h.gross_pence=(binding->>'grossPence')::bigint)
  OR (binding->>'existedAt')::timestamptz IS DISTINCT FROM lf.existed_at THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  INSERT INTO app.recovery_allocation_line_source(id,tenant_id,job_id,invoice_id,line_id,net_pence,gross_pence,existed_at,rule,source_ref)
  VALUES(gen_random_uuid(),p_tenant,p_job,inv.id,lf.id,lf.net_pence,(binding->>'grossPence')::bigint,lf.existed_at,CASE WHEN is_separate THEN 'separate_invoice' ELSE 'pro_rata' END,CASE WHEN is_separate THEN inv.id::text ELSE m.movement_id::text END) ON CONFLICT DO NOTHING;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(p_artifact->'bindings'))<>jsonb_array_length(p_artifact->'bindings')
 OR (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(p_artifact->'lines'))<>jsonb_array_length(p_artifact->'lines') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF p_command ? 'remittanceEvidenceId' AND p_artifact->>'remittanceEvidenceId' IS DISTINCT FROM p_command->>'remittanceEvidenceId' THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 -- Reliable explicit shares are verified against the finalized original's SHA-256, never trusted as an artifact flag.
 IF p_artifact->>'remittanceContent' IS NOT NULL THEN
  SELECT e.* INTO remittance_ev FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=(p_artifact->>'remittanceEvidenceId')::uuid AND e.kind='original' AND u.state='verified';
  IF remittance_ev.id IS NULL OR trim(remittance_ev.sha256)<>encode(sha256(decode(p_artifact->>'remittanceBytes','base64')),'hex')
  OR(EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=p_tenant AND evidence_id=remittance_ev.id) AND(original.id IS NULL OR p_command ? 'remittanceEvidenceId')) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  source_bytes:=decode(p_artifact->>'remittanceBytes','base64');content_bytes:=convert_to(p_artifact->>'remittanceContent','UTF8');
  content_offset:=octet_length(png_prefix)+8+octet_length(keyword)+1;
  IF source_bytes IS NULL OR octet_length(source_bytes)>100000 OR substring(source_bytes FROM 1 FOR octet_length(png_prefix))<>png_prefix
  OR substring(source_bytes FROM octet_length(png_prefix)+5 FOR 4)<>decode('74455874','hex')
  OR substring(source_bytes FROM octet_length(png_prefix)+9 FOR octet_length(keyword))<>keyword
  OR substring(source_bytes FROM content_offset FOR octet_length(content_bytes))<>content_bytes
  OR octet_length(source_bytes)<>octet_length(png_prefix)+8+octet_length(keyword)+octet_length(content_bytes)+4+12
  OR substring(source_bytes FROM octet_length(source_bytes)-11)<>decode('0000000049454e44ae426082','hex') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  IF p_command ? 'remittanceEvidenceId' AND p_command->>'remittanceEvidenceId' IS DISTINCT FROM remittance_ev.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  IF NOT(p_command ? 'remittanceEvidenceId') AND original.id IS NULL THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  remittance:=(p_artifact->>'remittanceContent')::jsonb;
  IF remittance->>'version' IS DISTINCT FROM 'recovery-remittance.v1' OR remittance->>'paymentId' IS DISTINCT FROM pid::text OR remittance->>'invoiceId' IS DISTINCT FROM inv.id::text
  OR jsonb_typeof(remittance->'shares') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 END IF;
 -- Validate every balance as a fraction, including eligible lines omitted from an explicit result.
 FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(binding->>'lineId')::uuid AND evidence_id IS NULL AND credit_note_id IS NULL;
  SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(a.gross_numerator,a.gross_denominator)),'[]')) INTO used_pair
  FROM app.receipt_line_allocation a WHERE a.tenant_id=p_tenant AND a.invoice_id=inv.id AND a.line_id=lf.line_id AND(direction=1 OR a.allocation_id=original.id)
  -- A new receipt is allocated against the balances that stood when IT settled: a later credit or payment reversal is its own fact and is not applied backwards.
  AND(direction<>1 OR a.reversal_id IS NULL OR EXISTS(SELECT 1 FROM app.recovery_case_allocation_reversal rv WHERE rv.tenant_id=a.tenant_id AND rv.id=a.reversal_id
   AND(CASE rv.source_kind WHEN 'payment_reversal' THEN(SELECT x.created_at FROM app.customer_payment_reversal x WHERE x.tenant_id=rv.tenant_id AND x.id=rv.source_id)
    ELSE(SELECT x.created_at FROM app.customer_credit_note x WHERE x.tenant_id=rv.tenant_id AND x.id=rv.source_id) END)<=m.created_at));
  balance_pair:=CASE WHEN direction=1 THEN ARRAY[lf.gross_pence*used_pair[2]-used_pair[1],used_pair[2]] ELSE used_pair END;
  IF m.created_at<lf.existed_at THEN balance_pair:=ARRAY[0::numeric,1::numeric]; END IF;
  IF balance_pair[1]<0 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  balances:=balances||jsonb_build_object(lf.line_id::text,jsonb_build_array(balance_pair[1]::text,balance_pair[2]::text));
  total_pair:=app.recovery_allocation_fraction_sum(jsonb_build_array(to_jsonb(total_pair),to_jsonb(balance_pair)));
 END LOOP;
 IF (SELECT sum(net_pence) FROM app.recovery_allocation_invoice_lines(p_tenant,p_job,inv.id)) IS DISTINCT FROM inv.net_pence THEN
  RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF remittance IS NOT NULL THEN
  IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(remittance->'shares'))<>jsonb_array_length(remittance->'shares') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  FOR share IN SELECT value FROM jsonb_array_elements(remittance->'shares') LOOP
   IF NOT(balances ? (share->>'lineId')) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 -- The separate-invoice rule is applied only when the invoice has real immutable issued-line bindings of kind 'supplementary'; it is never inferred from one account line.
 FOR line IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') LOOP
  SELECT * INTO lf FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(line->>'lineId')::uuid AND evidence_id IS NULL AND credit_note_id IS NULL;
  IF lf.id IS NULL OR NOT(balances ? lf.line_id::text) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  gn:=(line->'gross'->>'numerator')::numeric;gd:=(line->'gross'->>'denominator')::numeric;
  nn:=(line->'net'->>'numerator')::numeric;nd:=(line->'net'->>'denominator')::numeric;
  IF gn IS NULL OR gd IS NULL OR nn IS NULL OR nd IS NULL OR gn<>trunc(gn) OR gd<>trunc(gd) OR nn<>trunc(nn) OR nd<>trunc(nd)
  OR gd<=0 OR nd<=0 OR gn*direction<0 OR nn*direction<0 OR nn*gd*lf.gross_pence<>gn*nd*lf.net_pence
  OR gcd(abs(gn),gd)<>1 OR gcd(abs(nn),nd)<>1 THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  balance_pair:=ARRAY[(balances->lf.line_id::text->>0)::numeric,(balances->lf.line_id::text->>1)::numeric];
  IF abs(gn)*balance_pair[2]>balance_pair[1]*gd THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF direction=-1 THEN
   SELECT * INTO prior_line FROM app.receipt_line_allocation WHERE tenant_id=p_tenant AND allocation_id=original.id AND line_id=lf.line_id AND reversal_id IS NULL;
   IF prior_line.id IS NULL OR line->>'reversesId' IS DISTINCT FROM prior_line.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  ELSIF line->>'reversesId' IS NOT NULL THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  given_pair:=app.recovery_allocation_fraction_sum(jsonb_build_array(to_jsonb(given_pair),jsonb_build_array(abs(gn)::text,gd::text)));
  IF remittance IS NOT NULL THEN
   SELECT value INTO share FROM jsonb_array_elements(remittance->'shares') WHERE value->>'lineId'=lf.line_id::text;
   IF line->>'rule' IS DISTINCT FROM 'explicit' OR line->>'sourceRef' IS DISTINCT FROM remittance_ev.id::text THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   IF (direction=1 OR p_command ? 'remittanceEvidenceId') AND abs(gn)*(coalesce(share->'gross'->>'denominator','1'))::numeric<>coalesce(share->'gross'->>'numerator','0')::numeric*gd THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   IF direction=-1 AND NOT(p_command ? 'remittanceEvidenceId') AND abs(gn)*(coalesce(share->'gross'->>'denominator','1'))::numeric*original.gross_pence<>coalesce(share->'gross'->>'numerator','0')::numeric*gd*amount THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
   -- Record the reliable source alongside the immutable bound invoice line.
   IF NOT EXISTS(SELECT 1 FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=lf.line_id AND evidence_id=remittance_ev.id) THEN
    INSERT INTO app.recovery_allocation_line_source(id,tenant_id,job_id,invoice_id,line_id,net_pence,gross_pence,existed_at,evidence_id,evidence_object_version_id,evidence_hash,evidence_server_received_at,gross_numerator,gross_denominator,rule,source_ref)
    VALUES(gen_random_uuid(),p_tenant,p_job,inv.id,lf.line_id,lf.net_pence,lf.gross_pence,lf.existed_at,remittance_ev.id,remittance_ev.object_version_id,remittance_ev.sha256,remittance_ev.server_received_at,coalesce(share->'gross'->>'numerator','0'),coalesce(share->'gross'->>'denominator','1'),'explicit',remittance_ev.id::text);
   END IF;
  ELSIF line->>'rule' IS DISTINCT FROM (CASE WHEN is_separate THEN 'separate_invoice' ELSE 'pro_rata' END)
   OR line->>'sourceRef' IS DISTINCT FROM (CASE WHEN is_separate THEN inv.id::text WHEN original.id IS NULL THEN m.movement_id::text ELSE source_id::text END) THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF given_pair[1]<>amount*given_pair[2] OR total_pair[1]<amount*total_pair[2] THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
 IF remittance IS NULL THEN
  -- Check all lines, including omitted zero candidates: a positive proportional share cannot disappear.
  FOR binding IN SELECT value FROM jsonb_array_elements(p_artifact->'bindings') LOOP
   SELECT value INTO line FROM jsonb_array_elements(p_artifact->'lines') WHERE value->>'lineId'=binding->>'lineId';
   gn:=coalesce((line->'gross'->>'numerator')::numeric,0);gd:=coalesce((line->'gross'->>'denominator')::numeric,1);
   balance_pair:=ARRAY[(balances->(binding->>'lineId')->>0)::numeric,(balances->(binding->>'lineId')->>1)::numeric];
   IF abs(gn)*total_pair[1]*balance_pair[2]<>amount::numeric*balance_pair[1]*gd*total_pair[2] THEN RAISE EXCEPTION 'INVALID_ALLOCATION_FACTS' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 hash:=encode(sha256(convert_to(p_artifact::text,'UTF8')),'hex');
 IF action IN('review','review_reverse') THEN
  did:=gen_random_uuid();rid:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(did,p_tenant,'recovery_case',cid::text,'recovery_allocation.'||CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END);
  INSERT INTO app.recovery_allocation_review(id,tenant_id,job_id,case_id,payment_id,allocation_id,command_id,action,expected_case_revision,artifact,approval_hash,decision_id,reviewer_ref)
  VALUES(rid,p_tenant,p_job,cid,pid,original.id,(p_command->>'commandId')::uuid,CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END,c.revision,p_artifact,hash,did,'membership:'||actor.membership_id);
  result:=jsonb_build_object('caseId',cid,'replayed',false,'allocationId',NULL,'review',jsonb_build_object('action',CASE WHEN original.id IS NULL THEN 'allocate' ELSE 'reverse' END,'caseId',cid,'paymentId',pid,'allocationId',original.id,'expectedCaseRevision',c.revision,'grossPence',amount,'eligibleNetPence',net,'taxPence',tax,'approvalHash',hash,'policyVersion',p_artifact->>'policyVersion','movementHash',m.source_hash,'evidenceHash',ev.sha256));
 ELSE
  SELECT * INTO review FROM app.recovery_allocation_review WHERE tenant_id=p_tenant AND job_id=p_job AND case_id=cid AND approval_hash=p_command->>'approvalHash' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF review.id IS NULL OR review.artifact<>p_artifact OR review.expected_case_revision<>c.revision OR review.expires_at<=clock_timestamp()
  OR review.action<>action OR review.reviewer_ref<>'membership:'||actor.membership_id
  OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=p_tenant AND decision_id=review.decision_id) THEN RAISE EXCEPTION 'ALLOCATION_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  resolution_id:=gen_random_uuid();auth_id:=gen_random_uuid();aid:=gen_random_uuid();rid:=gen_random_uuid();
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,review.decision_id,'approved',actor.membership_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
  VALUES(auth_id,p_tenant,review.decision_id,resolution_id,actor.membership_id,'recovery_allocation.'||action,cid::text,hash,c.revision,amount,'GBP',p_artifact->>'policyVersion',review.expires_at);
  IF original.id IS NULL THEN
   INSERT INTO app.recovery_case_allocation(id,tenant_id,job_id,case_id,payment_id,invoice_id,command_id,review_id,authorization_id,gross_pence,eligible_net_pence,tax_pence,evidence_id,object_version_id,evidence_hash,evidence_server_received_at,policy_version,reviewer_ref,movement_id,movement_hash,account_id,settled_event_id)
   VALUES(aid,p_tenant,p_job,cid,pid,inv.id,(p_command->>'commandId')::uuid,review.id,auth_id,amount,net,tax,ev.id,ev.object_version_id,ev.sha256,ev.server_received_at,eligibility.policy_version,'membership:'||actor.membership_id,m.movement_id,m.source_hash,m.account_id,m.event_id);
  ELSE
   aid:=original.id;
   INSERT INTO app.recovery_case_allocation_reversal(id,tenant_id,job_id,allocation_id,command_id,review_id,authorization_id,source_kind,source_id,payment_reversal_id,credit_note_id,gross_pence,eligible_net_pence,tax_pence)
   VALUES(rid,p_tenant,p_job,aid,(p_command->>'commandId')::uuid,review.id,auth_id,source_kind,source_id,CASE WHEN source_kind='payment_reversal' THEN source_id END,CASE WHEN source_kind='credit_note' THEN source_id END,amount,net,tax);
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') LOOP
   SELECT id INTO source_binding FROM app.recovery_allocation_line_source WHERE tenant_id=p_tenant AND job_id=p_job AND invoice_id=inv.id AND line_id=(line->>'lineId')::uuid AND evidence_id IS NOT DISTINCT FROM CASE WHEN remittance IS NOT NULL THEN remittance_ev.id END AND credit_note_id IS NULL ORDER BY id LIMIT 1;
   INSERT INTO app.receipt_line_allocation(id,tenant_id,job_id,payment_id,invoice_id,line_id,allocation_id,reversal_id,reverses_id,source_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator)
   VALUES(gen_random_uuid(),p_tenant,p_job,pid,inv.id,(line->>'lineId')::uuid,aid,CASE WHEN original.id IS NOT NULL THEN rid END,CASE WHEN original.id IS NOT NULL THEN (line->>'reversesId')::uuid END,source_binding,line->>'rule',line->>'sourceRef',line->'gross'->>'numerator',line->'gross'->>'denominator',line->'net'->>'numerator',line->'net'->>'denominator');
  END LOOP;
  result:=jsonb_build_object('caseId',cid,'replayed',false,'allocationId',aid,'review',NULL);
 END IF;
 result:=result||jsonb_build_object('payloadHash',encode(sha256(convert_to(p_job::text||p_command::text,'UTF8')),'hex'),'approvalHash',hash);
 INSERT INTO app.recovery_allocation_command(command_id,tenant_id,job_id,case_id,actor_membership_id,payload,payload_hash,artifact,result)
 VALUES((p_command->>'commandId')::uuid,p_tenant,p_job,cid,actor.membership_id,p_command,encode(sha256(convert_to(p_job::text||p_command::text,'UTF8')),'hex'),p_artifact,result);
 RETURN result;
END $$;

-- (3a) Restates 0142 guard_recovery_eligibility_v3: F18 qualifying principal adds interest only when its own receipt settled.
CREATE OR REPLACE FUNCTION app.guard_recovery_eligibility_v3() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.recovery_case_current; e app.practice_feed_event; r app.recovery_eligibility_v3_review;
 digest text:=nullif(current_setting('app.practice_material_digest',true),'');
 expected_q bigint:=0; expected_reason text; expected_category text; expected_kind text;
 expected_net bigint; expected_debtor text; paid_before boolean; settled boolean; insurer_money boolean:=false; interest_settled boolean:=false;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=j.tenant_id
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='supplier_credit_consumption' THEN
  -- Do not relabel a customer receipt or supplier refund as an invoice payment.
  RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';
 END IF;
 IF TG_TABLE_NAME='recovery_claim_line' THEN
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  IF NOT FOUND OR r.created_at<>transaction_timestamp() THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
  expected_debtor:=CASE WHEN r.fixture='F19' THEN 'individual' ELSE 'business' END;
  expected_net:=CASE NEW.kind WHEN 'statutory_interest' THEN 12000 WHEN 'fixed_compensation' THEN 7000 ELSE
   CASE r.fixture WHEN 'F15' THEN 20000 WHEN 'F17' THEN 45000 WHEN 'F20' THEN 32000 WHEN 'F21' THEN 9000 WHEN 'F22' THEN 32000 ELSE 250000 END END;
  IF (NEW.kind<>'principal' AND r.fixture NOT IN('F18','F19')) OR NEW.debtor_type<>expected_debtor OR NEW.net_pence<>expected_net
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.case_id;
 IF NOT FOUND OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='23514';END IF;
 IF c.case_type='withheld_customer_payment' AND NEW.source_event_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('payer-mark:'||NEW.source_event_id::text));
  PERFORM app.lock_recovery_payer_job(NEW.tenant_id,NEW.job_id,NEW.actor_membership_id);
  insurer_money:=coalesce(app.recovery_job_payer_type(NEW.tenant_id,NEW.job_id)='insurer',false)
   AND coalesce((SELECT state FROM app.recovery_payment_payer_mark WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND source_event_id=NEW.source_event_id ORDER BY revision DESC LIMIT 1),'withdrawn')<>'customer_own';
 END IF;
 IF NEW.case_revision<>c.revision OR NEW.revision<>(SELECT coalesce(max(revision),0)+1 FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id)
 THEN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END IF;
 IF NEW.fixture IN('F14','F16-partial','F16-full') THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND fixture<>NEW.fixture)
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 expected_category:=CASE NEW.fixture WHEN 'F15' THEN 'merchant_overcharge' WHEN 'F17' THEN 'duplicate_supplier_payment' WHEN 'F21' THEN 'merchant_overcharge' WHEN 'F22' THEN 'prevention' ELSE 'withheld_customer_payment' END;
 IF c.case_type<>expected_category THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.source_event_id;
 expected_kind:=CASE NEW.fixture WHEN 'F17' THEN 'supplier-refund-540' WHEN 'F20' THEN 'receipt-384' ELSE 'receipt-3000' END;
 IF NEW.fixture NOT IN('F15','F21','F22') AND (e.id IS NULL OR e.movement_key<>expected_kind OR e.identity<>'identified' OR e.event_kind NOT IN('pending','settled'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
 IF NEW.fixture IN('F15','F21','F22') AND NEW.source_event_id IS NOT NULL THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 settled:=e.state='settled' AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
  AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.action='reconcile_duplicate' AND k.movement_key=u.movement_key));
 paid_before:=e.state='settled' AND e.created_at<=c.created_at;
 -- F18 interest is a separate claim component with its own receipt: it counts only when THAT receipt (receipt-interest-120) settled.
 IF NEW.fixture='F18' THEN
  SELECT coalesce(ie.state='settled' AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=ie.tenant_id AND u.account_id=ie.account_id AND u.movement_key=ie.movement_key AND u.identity='unidentified'
   AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.action='reconcile_duplicate' AND k.movement_key=u.movement_key)),false) INTO interest_settled
  FROM (SELECT * FROM app.practice_feed_event i WHERE i.tenant_id=NEW.tenant_id AND i.job_id=NEW.job_id AND i.movement_key='receipt-interest-120' AND i.identity='identified' AND i.event_kind IN('settled','pending')
   ORDER BY (i.event_kind='settled') DESC,i.created_at,i.id LIMIT 1) ie;
  interest_settled:=coalesce(interest_settled,false);
 END IF;
 IF NEW.fixture='F20' AND NOT coalesce(paid_before,false) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.fixture='F15' THEN expected_reason:='Credit note below the £250 minimum';
 ELSIF NEW.fixture='F22' THEN expected_reason:='Prevented spending is not recovered cash';
 ELSIF NEW.fixture='F21' THEN expected_reason:=NULL;
 ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
 ELSIF insurer_money THEN expected_reason:='Insurer proceeds never qualify';
 ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
 ELSE expected_q:=CASE NEW.fixture WHEN 'F17' THEN 45000 WHEN 'F18' THEN 250000+(CASE WHEN interest_settled THEN 12000 ELSE 0 END) WHEN 'F19' THEN 250000 ELSE 0 END;
  expected_reason:=CASE WHEN NEW.fixture IN('F18','F19') THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END;
 END IF;
 IF expected_q>c.claim_pence+(CASE WHEN NEW.fixture='F18' THEN 12000 ELSE 0 END) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.result - ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'] IS DISTINCT FROM '{}'::jsonb
 OR NOT (NEW.result ?& ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'])
 OR coalesce(jsonb_typeof(NEW.result->'version'),'absent')<>'string' OR coalesce(jsonb_typeof(NEW.result->'policyVersion'),'absent')<>'string'
 OR coalesce(jsonb_typeof(NEW.result->'fixture'),'absent')<>'string' OR coalesce(jsonb_typeof(NEW.result->'outcome'),'absent')<>'string'
 OR coalesce(jsonb_typeof(NEW.result->'qualifyingPrincipal'),'absent')<>'object' OR coalesce(jsonb_typeof(NEW.result->'lines'),'absent')<>'array'
 OR coalesce(jsonb_typeof(NEW.result->'reason'),'absent') NOT IN('string','null')
 OR coalesce(jsonb_typeof(NEW.result->'reasonHeld'),'absent')<>'boolean' OR coalesce(jsonb_typeof(NEW.result->'terminal'),'absent')<>'boolean' OR coalesce(jsonb_typeof(NEW.result->'productionEnabled'),'absent')<>'boolean'
 OR NEW.result->>'version' IS DISTINCT FROM 'recovery-eligibility-review.v3' OR NEW.result->>'policyVersion' IS DISTINCT FROM NEW.policy_version
 OR NEW.result->>'fixture' IS DISTINCT FROM NEW.fixture OR NEW.result->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('pence',expected_q,'currency','GBP')
 OR NEW.result->>'reason' IS DISTINCT FROM expected_reason OR NEW.result->>'outcome' IS DISTINCT FROM (CASE WHEN expected_q>0 THEN 'eligible_for_review' ELSE 'excluded' END)
 OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture='F21')
 OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

-- (3b) Restates 0142 require_recovery_eligibility_v3_effect: the deferred line check applies the same component rule and binds the interest source in the audit.
CREATE OR REPLACE FUNCTION app.require_recovery_eligibility_v3_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE expected_lines jsonb; candidate_q bigint:=(NEW.result->'qualifyingPrincipal'->>'pence')::bigint; interest_settled boolean:=false; interest_event uuid;
BEGIN
 IF NEW.fixture='F18' THEN
  SELECT ie.id,coalesce(ie.state='settled' AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=ie.tenant_id AND u.account_id=ie.account_id AND u.movement_key=ie.movement_key AND u.identity='unidentified'
   AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.action='reconcile_duplicate' AND k.movement_key=u.movement_key)),false) INTO interest_event,interest_settled
  FROM (SELECT * FROM app.practice_feed_event i WHERE i.tenant_id=NEW.tenant_id AND i.job_id=NEW.job_id AND i.movement_key='receipt-interest-120' AND i.identity='identified' AND i.event_kind IN('settled','pending')
   ORDER BY (i.event_kind='settled') DESC,i.created_at,i.id LIMIT 1) ie;
  interest_settled:=coalesce(interest_settled,false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.case_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text AND event_type='recovery.eligibility.v3_reviewed'
  AND payload->'references'->>'reviewId'=NEW.id::text AND payload->'references'->>'commandId'=NEW.command_id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text
  AND payload->'hashes'->>'result'=encode(sha256(convert_to(NEW.result::text,'UTF8')),'hex')
  AND(NEW.fixture<>'F18' OR payload->'references'->>'interestSourceEventId' IS NULL OR payload->'references'->>'interestSourceEventId'=interest_event::text))
 THEN RAISE EXCEPTION 'ELIGIBILITY_AUDIT_REQUIRED' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM app.recovery_claim_line WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture IN('F18','F19') THEN 3 ELSE 1 END)
 THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(jsonb_build_object(
  'kind',l.kind,'debtorType',l.debtor_type,'netPence',l.net_pence,
  'qualifyingPrincipal',jsonb_build_object('pence',CASE WHEN candidate_q=0 OR l.kind='fixed_compensation' OR l.kind='statutory_interest' AND l.debtor_type='individual' OR l.kind='statutory_interest' AND NEW.fixture='F18' AND NOT interest_settled THEN 0 ELSE l.net_pence END,'currency','GBP'),
  'reason',CASE WHEN NEW.result->>'reason'='Paid before you opened this case' THEN 'Paid before you opened this case'
    WHEN NEW.result->>'reason'='Insurer proceeds never qualify' THEN 'Insurer proceeds never qualify'
    WHEN NEW.fixture='F15' THEN 'Credit note below the £250 minimum'
    WHEN NEW.fixture='F22' THEN 'Prevented spending is not recovered cash'
    WHEN l.kind='fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base'
    WHEN l.kind='statutory_interest' AND l.debtor_type='individual' THEN 'Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.'
    WHEN l.kind='statutory_interest' AND l.debtor_type='business' AND NEW.fixture='F18' AND NOT interest_settled THEN 'Pending money cannot qualify'
    WHEN NEW.result->>'reason'='Pending money cannot qualify' THEN 'Pending money cannot qualify' ELSE NULL END,
  'reasonHeld',NEW.fixture='F21')
  ORDER BY CASE l.kind WHEN 'principal' THEN 1 WHEN 'statutory_interest' THEN 2 ELSE 3 END)
 INTO expected_lines FROM app.recovery_claim_line l WHERE l.tenant_id=NEW.tenant_id AND l.review_id=NEW.id;
 IF NEW.result->'lines' IS DISTINCT FROM expected_lines THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;

COMMIT;
