BEGIN;
-- Restates 0119's app.guard_recovery_eligibility_v3 exactly except that its existing
-- paid_before exclusion also applies to duplicate_supplier_payment (F17).
-- The original settlement <= case opening expression, all other checks, and
-- existing ownership/privileges are unchanged; no existing row is rewritten.
CREATE OR REPLACE FUNCTION app.guard_recovery_eligibility_v3() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.recovery_case_current; e app.practice_feed_event; r app.recovery_eligibility_v3_review;
 digest text:=nullif(current_setting('app.practice_material_digest',true),'');
 expected_q bigint:=0; expected_reason text; expected_category text; expected_kind text;
 expected_net bigint; expected_debtor text; paid_before boolean; settled boolean;
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
 IF NEW.fixture='F20' AND NOT coalesce(paid_before,false) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.fixture='F15' THEN expected_reason:='Credit note below the £250 minimum';
 ELSIF NEW.fixture='F22' THEN expected_reason:='Prevented spending is not recovered cash';
 ELSIF NEW.fixture='F21' THEN expected_reason:=NULL;
 ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
 ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
 ELSE expected_q:=CASE NEW.fixture WHEN 'F17' THEN 45000 WHEN 'F18' THEN 262000 WHEN 'F19' THEN 250000 ELSE 0 END;
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
 OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture IN('F19','F21'))
 OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
COMMIT;
