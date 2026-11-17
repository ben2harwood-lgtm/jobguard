-- CH-7-REST-B / decision 123 as applied by ruling 130 (option B). Restates 0197 guards; no history/backfill.
-- Fee terms never gate a review. Only an approval that EXISTS and is strictly later than the settled source excludes (decision 123 note).
-- No approval, an earlier approval or an equal timestamp evaluate exactly as before DW3. No review refusal for terms (the requirement lives at pursuit).
BEGIN;

CREATE OR REPLACE FUNCTION app.guard_recovery_eligibility_v3() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.recovery_case_current; e app.practice_feed_event; r app.recovery_eligibility_v3_review;
 digest text:=nullif(current_setting('app.practice_material_digest',true),'');
 sources jsonb; expected_result jsonb; binding app.practice_supplier_credit_case_binding;
 expected_q bigint:=0; expected_reason text; expected_category text; expected_kind text;
 terms app.recovery_case_terms_approval; pre_terms boolean:=false;
 expected_net bigint; expected_debtor text; paid_before boolean; settled boolean; insurer_money boolean:=false; interest app.practice_feed_event; interest_reason text;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=j.tenant_id
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='supplier_credit_consumption' THEN
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
  IF r.id IS NULL OR r.fixture NOT IN('F14','F16-full') OR r.created_at<>transaction_timestamp() OR binding.id IS NULL
  OR NEW.credit_note_id<>binding.credit_note_id OR NEW.later_invoice_id<>binding.later_invoice_id OR NEW.settled_payment_event_id<>r.source_event_id OR NEW.consumed_net_pence<>30000
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  sources:=app.pf1b_source_bundle(NEW.tenant_id,NEW.job_id,NEW.case_id);
  IF jsonb_array_length(sources->'payments')<>2 OR r.source_event_id IS DISTINCT FROM (SELECT (p->>'id')::uuid FROM jsonb_array_elements(sources->'payments') p WHERE p->>'movement'='supplier-payment-840')
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  NEW.created_at:=transaction_timestamp();RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='recovery_claim_line' THEN
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  IF NOT FOUND OR r.created_at<>transaction_timestamp() THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
  expected_debtor:=CASE WHEN r.fixture='F19' THEN 'individual' ELSE 'business' END;
  expected_net:=CASE NEW.kind WHEN 'statutory_interest' THEN 12000 WHEN 'fixed_compensation' THEN 7000 ELSE
   CASE r.fixture WHEN 'F14' THEN 30000 WHEN 'F16-partial' THEN 30000 WHEN 'F16-full' THEN 30000 WHEN 'F15' THEN 20000 WHEN 'F17' THEN 45000 WHEN 'F20' THEN 32000 WHEN 'F21' THEN 9000 WHEN 'F22' THEN 32000 ELSE 250000 END END;
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
 IF NEW.fixture IN('F14','F16-partial','F16-full') THEN
  -- Runtime's historical INSERT privilege cannot bypass the new checked writer.
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id AND status='live')
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  sources:=app.pf1b_source_bundle(NEW.tenant_id,NEW.job_id,NEW.case_id);
  IF c.case_type<>'merchant_overcharge' OR c.claim_pence<30000
  OR EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review x WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND x.revision=(SELECT max(y.revision) FROM app.recovery_eligibility_v3_review y WHERE y.tenant_id=NEW.tenant_id AND y.case_id=NEW.case_id)
   AND x.fixture<>NEW.fixture AND NOT(x.fixture='F16-partial' AND NEW.fixture='F16-full'))
  OR NEW.fixture='F16-full' AND NOT EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review x WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND x.fixture IN('F16-partial','F16-full'))
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  IF NEW.fixture='F16-partial' AND jsonb_array_length(sources->'payments')<>1 OR NEW.fixture<>'F16-partial' AND jsonb_array_length(sources->'payments')<>2
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
  IF binding.id IS NULL OR binding.credit_note_id<>(sources->>'creditId')::uuid OR binding.credit_note_version_id<>(sources->>'creditVersionId')::uuid
  OR binding.later_invoice_id<>(sources->>'invoiceId')::uuid OR binding.later_invoice_version_id<>(sources->>'invoiceVersionId')::uuid
  OR binding.credit_source_hash<>sources->>'creditHash' OR binding.invoice_source_hash<>sources->>'invoiceHash'
  OR NEW.source_event_id IS DISTINCT FROM (SELECT (p->>'id')::uuid FROM jsonb_array_elements(sources->'payments') p WHERE p->>'movement'=CASE WHEN NEW.fixture='F16-partial' THEN 'supplier-payment-600' ELSE 'supplier-payment-840' END)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
  expected_q:=CASE WHEN NEW.fixture='F16-partial' THEN 0 ELSE 30000 END;
  expected_reason:=CASE WHEN NEW.fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full' ELSE NULL END;
  expected_result:=jsonb_build_object('version','recovery-eligibility-review.v3','policyVersion','reference_recovery_eligibility_policy_v3','fixture',NEW.fixture,'outcome',CASE WHEN expected_q=0 THEN 'excluded' ELSE 'eligible_for_review' END,'qualifyingPrincipal',jsonb_build_object('pence',expected_q,'currency','GBP'),'reason',expected_reason,'reasonHeld',false,'terminal',false,'productionEnabled',false,
   'lines',jsonb_build_array(jsonb_build_object('kind','principal','debtorType','business','netPence',30000,'qualifyingPrincipal',jsonb_build_object('pence',expected_q,'currency','GBP'),'reason',expected_reason,'reasonHeld',false)));
  IF NEW.result IS DISTINCT FROM expected_result OR NEW.policy_version<>'reference_recovery_eligibility_policy_v3' OR NEW.environment<>'synthetic_demo'
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  NEW.created_at:=transaction_timestamp();RETURN NEW;
 END IF;
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
 IF c.case_type='withheld_customer_payment' THEN
  SELECT a.* INTO terms FROM app.recovery_case_terms_approval a
   JOIN app.job j ON j.tenant_id=a.tenant_id AND j.id=a.job_id AND j.fee_policy_version=a.fee_policy_version
   WHERE a.tenant_id=NEW.tenant_id AND a.job_id=NEW.job_id AND a.case_id=NEW.case_id
    AND a.terms_version='synthetic_recovery_fee_terms.v1' AND a.fee_policy_version='reference_fee_policy_v3'
    AND a.eligibility_policy_version='reference_recovery_eligibility_policy_v3' AND a.environment='synthetic_demo' AND a.policy_status='proposed';
  -- No approval row leaves terms.id NULL and pre_terms false: the pre-DW3 expectation applies. Never a refusal.
  pre_terms:=terms.id IS NOT NULL AND coalesce(e.state='settled' AND e.created_at<terms.approved_at,false);
 END IF;
 IF NEW.fixture='F20' AND NOT coalesce(paid_before,false) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.fixture='F15' THEN expected_reason:='Credit note below the £250 minimum';
 ELSIF NEW.fixture='F22' THEN expected_reason:='Prevented spending is not recovered cash';
 ELSIF NEW.fixture='F21' THEN expected_reason:='Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.';
 ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
 ELSIF insurer_money THEN expected_reason:='Insurer proceeds never qualify';
 ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
 ELSIF pre_terms THEN expected_reason:='This came in before your fee terms were agreed, so it isn''t counted as recovered money and there''s no fee on it.';
 ELSE expected_q:=CASE NEW.fixture WHEN 'F17' THEN 45000 WHEN 'F18' THEN 262000 WHEN 'F19' THEN 250000 ELSE 0 END;
  expected_reason:=CASE WHEN NEW.fixture IN('F18','F19') THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END;
 END IF;
 -- F18's principal receipt does not settle its separate interest movement.
 IF NEW.fixture='F18' AND expected_q>0 THEN
  SELECT i.* INTO interest FROM app.practice_feed_event i
   WHERE i.tenant_id=NEW.tenant_id AND i.job_id=NEW.job_id AND i.movement_key='receipt-interest-120'
    AND i.identity='identified' AND i.event_kind IN('settled','pending')
   ORDER BY (i.event_kind='settled') DESC,i.created_at,i.id LIMIT 1;
  IF interest.state='settled' AND interest.created_at<=c.created_at THEN
   interest_reason:='Paid before you opened this case';
  ELSIF interest.id IS NULL OR interest.state<>'settled' OR EXISTS(
   SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=interest.tenant_id AND u.account_id=interest.account_id
    AND u.movement_key=interest.movement_key AND u.identity='unidentified'
    AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id
     AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate')) THEN
   interest_reason:='Pending money cannot qualify';
  ELSIF terms.id IS NOT NULL AND interest.created_at<terms.approved_at THEN interest_reason:='This came in before your fee terms were agreed, so it isn''t counted as recovered money and there''s no fee on it.';
  END IF;
  IF interest_reason IS NOT NULL THEN expected_q:=250000;expected_reason:=interest_reason;END IF;
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
 OR NEW.result->'reasonHeld' IS DISTINCT FROM 'false'::jsonb
 OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.require_recovery_eligibility_v3_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE binding app.practice_supplier_credit_case_binding; count_links integer; expected_lines jsonb; candidate_q bigint:=(NEW.result->'qualifyingPrincipal'->>'pence')::bigint;
BEGIN
 -- The approval reference is demanded only when the saved result IS the decision 123 terms exclusion; a review produced without terms needs none.
 IF NEW.fixture IN('F18','F19','F20') AND position('This came in before your fee terms were agreed, so it isn''t counted as recovered money and there''s no fee on it.' in NEW.result::text)>0 AND NOT EXISTS(
  SELECT 1 FROM app.audit_event e JOIN app.recovery_case_terms_approval a
   ON a.tenant_id=e.tenant_id AND a.id::text=e.payload->'references'->>'termsApprovalId'
  WHERE e.tenant_id=NEW.tenant_id AND e.event_type='recovery.eligibility.v3_reviewed' AND e.subject_ref=NEW.case_id::text
   AND e.payload->'references'->>'reviewId'=NEW.id::text AND a.job_id=NEW.job_id AND a.case_id=NEW.case_id
   AND a.terms_version='synthetic_recovery_fee_terms.v1' AND a.fee_policy_version='reference_fee_policy_v3'
   AND a.eligibility_policy_version='reference_recovery_eligibility_policy_v3')
 THEN RAISE EXCEPTION 'ELIGIBILITY_AUDIT_REQUIRED' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.case_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text AND event_type='recovery.eligibility.v3_reviewed'
  AND payload->'references'->>'reviewId'=NEW.id::text AND payload->'references'->>'commandId'=NEW.command_id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text
  AND payload->'hashes'->>'result'=encode(sha256(convert_to(NEW.result::text,'UTF8')),'hex'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_AUDIT_REQUIRED' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM app.recovery_claim_line WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture IN('F18','F19') THEN 3 ELSE 1 END)
 THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(jsonb_build_object(
  'kind',l.kind,'debtorType',l.debtor_type,'netPence',l.net_pence,
  'qualifyingPrincipal',jsonb_build_object('pence',CASE WHEN candidate_q=0 OR l.kind='fixed_compensation' OR l.kind='statutory_interest' AND (l.debtor_type='individual' OR NEW.fixture='F18' AND candidate_q=250000) THEN 0 ELSE l.net_pence END,'currency','GBP'),
  'reason',CASE WHEN NEW.fixture='F18' AND candidate_q=250000 THEN
     CASE l.kind WHEN 'statutory_interest' THEN NEW.result->>'reason'
      WHEN 'fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END
    WHEN NEW.result->>'reason'='Paid before you opened this case' THEN 'Paid before you opened this case'
    WHEN NEW.result->>'reason'='Insurer proceeds never qualify' THEN 'Insurer proceeds never qualify'
    WHEN NEW.fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full'
    WHEN NEW.fixture='F21' THEN 'Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.'
    WHEN NEW.fixture='F15' THEN 'Credit note below the £250 minimum'
    WHEN NEW.fixture='F22' THEN 'Prevented spending is not recovered cash'
    WHEN l.kind='fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base'
    WHEN l.kind='statutory_interest' AND l.debtor_type='individual' THEN 'Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.'
    WHEN NEW.result->>'reason'='This came in before your fee terms were agreed, so it isn''t counted as recovered money and there''s no fee on it.' THEN 'This came in before your fee terms were agreed, so it isn''t counted as recovered money and there''s no fee on it.'
    WHEN NEW.result->>'reason'='Pending money cannot qualify' THEN 'Pending money cannot qualify' ELSE NULL END,
  'reasonHeld',false)
  ORDER BY CASE l.kind WHEN 'principal' THEN 1 WHEN 'statutory_interest' THEN 2 ELSE 3 END)
 INTO expected_lines FROM app.recovery_claim_line l WHERE l.tenant_id=NEW.tenant_id AND l.review_id=NEW.id;
 IF NEW.result->'lines' IS DISTINCT FROM expected_lines THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 IF NEW.fixture IN('F14','F16-partial','F16-full') THEN
  SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
  IF binding.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review first_review WHERE first_review.tenant_id=binding.tenant_id AND first_review.case_id=binding.case_id AND first_review.command_id=binding.command_id AND first_review.actor_membership_id=binding.actor_membership_id AND first_review.created_at=binding.created_at)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  -- The FK alone does not establish that a version belongs to its named document.
  IF NOT EXISTS(SELECT 1 FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
   WHERE d.tenant_id=NEW.tenant_id AND d.job_id=NEW.job_id AND d.id=binding.credit_note_id AND v.id=binding.credit_note_version_id AND d.document_type='credit' AND d.status='ready' AND d.supplier_context='fictional-merchant'
   AND d.document_number='CR-PF1B-001' AND d.content_hash=binding.credit_source_hash AND v.content_hash=binding.credit_source_hash AND v.version=1 AND v.parent_version_id IS NULL
   AND d.content_hash=encode(sha256(convert_to(E'FICTIONAL INTERIM SUPPLIER CREDIT CR-PF1B-001\nNET GBP 300.00','UTF8')),'hex'))
  OR NOT EXISTS(SELECT 1 FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
   WHERE d.tenant_id=NEW.tenant_id AND d.job_id=NEW.job_id AND d.id=binding.later_invoice_id AND v.id=binding.later_invoice_version_id AND d.document_type='invoice' AND d.status='ready' AND d.supplier_context='fictional-merchant'
   AND d.document_number='INV-PF1B-001' AND d.content_hash=binding.invoice_source_hash AND v.content_hash=binding.invoice_source_hash AND v.version=1 AND v.parent_version_id IS NULL
   AND d.content_hash=encode(sha256(convert_to(E'FICTIONAL INTERIM LATER SUPPLIER INVOICE INV-PF1B-001\nAMOUNT TO PAY GBP 1440.00','UTF8')),'hex'))
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  SELECT count(*) INTO count_links FROM app.practice_supplier_credit_review_payment WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id;
  IF count_links<>(CASE WHEN NEW.fixture='F16-partial' THEN 1 ELSE 2 END)
  OR (SELECT coalesce(sum(gross_pence),0) FROM app.practice_supplier_credit_review_payment WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture='F16-partial' THEN 60000 ELSE 144000 END)
  OR EXISTS(SELECT 1 FROM app.practice_supplier_credit_review_payment p
   LEFT JOIN app.practice_feed_event e ON(e.tenant_id,e.job_id,e.id)=(p.tenant_id,p.job_id,p.payment_event_id)
   LEFT JOIN app.practice_feed_account a ON(a.tenant_id,a.job_id,a.id)=(e.tenant_id,e.job_id,e.account_id)
   LEFT JOIN app.practice_feed_command k ON(k.tenant_id,k.job_id,k.account_id,k.id)=(e.tenant_id,e.job_id,e.account_id,e.command_id)
   LEFT JOIN app.recovery_case c ON(c.tenant_id,c.job_id,c.id)=(p.tenant_id,p.job_id,p.case_id)
   LEFT JOIN app.job j ON(j.tenant_id,j.id)=(p.tenant_id,p.job_id)
   WHERE p.tenant_id=NEW.tenant_id AND p.review_id=NEW.id AND (e.id IS NULL OR a.id IS NULL OR k.id IS NULL OR c.id IS NULL OR p.case_id<>NEW.case_id OR p.job_id<>NEW.job_id
    OR e.event_kind<>'settled' OR e.state<>'settled' OR e.identity<>'identified' OR e.representation_id<>'feed' OR e.event_id<>'settled-'||p.movement_key
    OR e.movement_key<>p.movement_key OR e.gross_pence<>p.gross_pence OR e.source_hash<>p.source_hash OR e.currency<>'GBP' OR e.created_at<=c.created_at
    OR a.session_digest IS DISTINCT FROM j.practice_session_digest OR a.actor_membership_id<>NEW.actor_membership_id OR k.actor_membership_id<>a.actor_membership_id OR a.environment<>'synthetic_demo' OR e.environment<>'synthetic_demo' OR k.environment<>'synthetic_demo'
    OR k.action<>'advance' OR k.step NOT IN('settled','page_overlap','replay') OR k.movement_key<>p.movement_key OR e.version<>'practice-feed-event.v1'
    OR e.source_hash<>encode(sha256(convert_to(concat_ws('|',e.version,e.environment,e.tenant_id::text,e.job_id::text,e.account_id::text,e.event_id,e.event_kind,e.movement_key,e.identity,e.representation_id,e.gross_pence::text,e.currency,e.state),'UTF8')),'hex')
    OR EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
     AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command r WHERE r.tenant_id=u.tenant_id AND r.account_id=u.account_id AND r.movement_key=u.movement_key AND r.action='reconcile_duplicate'))))
  OR NOT EXISTS(SELECT 1 FROM app.practice_supplier_credit_review_payment p WHERE p.tenant_id=NEW.tenant_id AND p.review_id=NEW.id AND p.payment_event_id=NEW.source_event_id AND p.movement_key=CASE WHEN NEW.fixture='F16-partial' THEN 'supplier-payment-600' ELSE 'supplier-payment-840' END)
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  IF NEW.fixture='F16-partial' THEN
   IF candidate_q<>0 OR EXISTS(SELECT 1 FROM app.supplier_credit_consumption WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)
   THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  ELSE
   IF candidate_q<>30000 OR (SELECT count(*) FROM app.supplier_credit_consumption WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND review_id=NEW.id AND credit_note_id=binding.credit_note_id AND later_invoice_id=binding.later_invoice_id AND settled_payment_event_id=NEW.source_event_id AND consumed_net_pence=30000)<>1
   THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;

COMMIT;
