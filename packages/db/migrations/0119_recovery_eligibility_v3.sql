BEGIN;
-- CH-7 synthetic candidates only. No terms approval, pursuit guard, insurer rule,
-- allocation, posting or production consumed-credit path is introduced.
ALTER TABLE app.recovery_case DROP CONSTRAINT recovery_case_case_type_check;
ALTER TABLE app.recovery_case ADD CONSTRAINT recovery_case_case_type_check
 CHECK(case_type IN('merchant_overcharge','withheld_customer_payment','prevention','duplicate_supplier_payment'));
ALTER TABLE app.practice_feed_event ADD CONSTRAINT practice_feed_event_job_identity UNIQUE(tenant_id,job_id,id);

CREATE TABLE app.recovery_eligibility_v3_review (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),case_revision integer NOT NULL CHECK(case_revision>0),
 fixture text NOT NULL CHECK(fixture IN('F14','F15','F16-partial','F16-full','F17','F18','F19','F20','F21','F22')),
 policy_version text NOT NULL DEFAULT 'reference_recovery_eligibility_policy_v3' CHECK(policy_version='reference_recovery_eligibility_policy_v3'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 source_event_id uuid,actor_membership_id uuid NOT NULL,command_id uuid NOT NULL,
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,command_id),UNIQUE(tenant_id,case_id,revision),UNIQUE(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,source_event_id) REFERENCES app.practice_feed_event(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.recovery_claim_line (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,review_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('principal','statutory_interest','fixed_compensation')),
 debtor_type text NOT NULL CHECK(debtor_type IN('business','individual')),
 net_pence bigint NOT NULL CHECK(net_pence>0 AND net_pence<=1000000000000),currency char(3) NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,review_id,kind),
 FOREIGN KEY(tenant_id,job_id,case_id,review_id) REFERENCES app.recovery_eligibility_v3_review(tenant_id,job_id,case_id,id)
);
-- Typed credit proof, never a cash receipt. A supplier-invoice payment is absent
-- from the merged M4-7-S catalogue, so the write path fails closed below.
CREATE TABLE app.supplier_credit_consumption (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,review_id uuid NOT NULL,
 credit_note_id uuid NOT NULL,later_invoice_id uuid NOT NULL,settled_payment_event_id uuid NOT NULL,
 consumed_net_pence bigint NOT NULL CHECK(consumed_net_pence>0 AND consumed_net_pence<=1000000000000),currency char(3) NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,review_id),
 FOREIGN KEY(tenant_id,job_id,case_id,review_id) REFERENCES app.recovery_eligibility_v3_review(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,job_id,credit_note_id) REFERENCES app.supplier_document(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,later_invoice_id) REFERENCES app.supplier_document(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,settled_payment_event_id) REFERENCES app.practice_feed_event(tenant_id,job_id,id),
 CHECK(credit_note_id<>later_invoice_id)
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_eligibility_v3_review','recovery_claim_line','supplier_credit_consumption'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;
CREATE FUNCTION app.guard_recovery_eligibility_v3() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
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
 ELSIF coalesce(paid_before,false) AND c.case_type='withheld_customer_payment' THEN expected_reason:='Paid before you opened this case';
 ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
 ELSE expected_q:=CASE NEW.fixture WHEN 'F17' THEN 45000 WHEN 'F18' THEN 262000 WHEN 'F19' THEN 250000 ELSE 0 END;
  expected_reason:=CASE WHEN NEW.fixture IN('F18','F19') THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END;
 END IF;
 IF expected_q>c.claim_pence+(CASE WHEN NEW.fixture='F18' THEN 12000 ELSE 0 END) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.result - ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'] IS DISTINCT FROM '{}'::jsonb
 OR NEW.result->>'version' IS DISTINCT FROM 'recovery-eligibility-review.v3' OR NEW.result->>'policyVersion' IS DISTINCT FROM NEW.policy_version
 OR NEW.result->>'fixture' IS DISTINCT FROM NEW.fixture OR NEW.result->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('pence',expected_q,'currency','GBP')
 OR NEW.result->>'reason' IS DISTINCT FROM expected_reason OR NEW.result->>'outcome' IS DISTINCT FROM (CASE WHEN expected_q>0 THEN 'eligible_for_review' ELSE 'excluded' END)
 OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture IN('F19','F21'))
 OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_recovery_eligibility_v3() OWNER TO jobguard_migration;
CREATE TRIGGER recovery_eligibility_v3_guard BEFORE INSERT ON app.recovery_eligibility_v3_review FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_eligibility_v3();
CREATE TRIGGER recovery_claim_line_guard BEFORE INSERT ON app.recovery_claim_line FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_eligibility_v3();
CREATE TRIGGER supplier_credit_consumption_guard BEFORE INSERT ON app.supplier_credit_consumption FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_eligibility_v3();
CREATE FUNCTION app.require_recovery_eligibility_v3_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE expected_lines jsonb; candidate_q bigint:=(NEW.result->'qualifyingPrincipal'->>'pence')::bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.case_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text AND event_type='recovery.eligibility.v3_reviewed'
  AND payload->'references'->>'reviewId'=NEW.id::text AND payload->'references'->>'commandId'=NEW.command_id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text
  AND payload->'hashes'->>'result'=encode(sha256(convert_to(NEW.result::text,'UTF8')),'hex'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_AUDIT_REQUIRED' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM app.recovery_claim_line WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture IN('F18','F19') THEN 3 ELSE 1 END)
 THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(jsonb_build_object(
  'kind',l.kind,'debtorType',l.debtor_type,'netPence',l.net_pence,
  'qualifyingPrincipal',jsonb_build_object('pence',CASE WHEN candidate_q=0 OR l.kind='fixed_compensation' OR l.kind='statutory_interest' AND l.debtor_type='individual' THEN 0 ELSE l.net_pence END,'currency','GBP'),
  'reason',CASE WHEN NEW.result->>'reason'='Paid before you opened this case' THEN 'Paid before you opened this case'
    WHEN NEW.fixture='F15' THEN 'Credit note below the £250 minimum'
    WHEN NEW.fixture='F22' THEN 'Prevented spending is not recovered cash'
    WHEN l.kind='fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base'
    WHEN NEW.result->>'reason'='Pending money cannot qualify' THEN 'Pending money cannot qualify' ELSE NULL END,
  'reasonHeld',NEW.fixture='F21' OR l.kind='statutory_interest' AND l.debtor_type='individual')
  ORDER BY CASE l.kind WHEN 'principal' THEN 1 WHEN 'statutory_interest' THEN 2 ELSE 3 END)
 INTO expected_lines FROM app.recovery_claim_line l WHERE l.tenant_id=NEW.tenant_id AND l.review_id=NEW.id;
 IF NEW.result->'lines' IS DISTINCT FROM expected_lines THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_recovery_eligibility_v3_effect() OWNER TO jobguard_migration;
CREATE CONSTRAINT TRIGGER recovery_eligibility_v3_complete AFTER INSERT ON app.recovery_eligibility_v3_review DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_recovery_eligibility_v3_effect();
CREATE FUNCTION app.prevent_recovery_eligibility_v3_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN RAISE EXCEPTION 'recovery eligibility history is append-only' USING ERRCODE='42501';END $$;
ALTER FUNCTION app.prevent_recovery_eligibility_v3_mutation() OWNER TO jobguard_migration;
CREATE TRIGGER recovery_eligibility_v3_immutable BEFORE UPDATE OR DELETE ON app.recovery_eligibility_v3_review FOR EACH ROW EXECUTE FUNCTION app.prevent_recovery_eligibility_v3_mutation();
CREATE TRIGGER recovery_claim_line_immutable BEFORE UPDATE OR DELETE ON app.recovery_claim_line FOR EACH ROW EXECUTE FUNCTION app.prevent_recovery_eligibility_v3_mutation();
CREATE TRIGGER supplier_credit_consumption_immutable BEFORE UPDATE OR DELETE ON app.supplier_credit_consumption FOR EACH ROW EXECUTE FUNCTION app.prevent_recovery_eligibility_v3_mutation();
REVOKE ALL ON FUNCTION app.guard_recovery_eligibility_v3(),app.require_recovery_eligibility_v3_effect(),app.prevent_recovery_eligibility_v3_mutation() FROM PUBLIC,jobguard_runtime;
COMMIT;
