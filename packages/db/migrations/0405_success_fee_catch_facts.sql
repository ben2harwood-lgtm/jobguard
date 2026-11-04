BEGIN;
-- M4-9-S RED: private synthetic catch-only fee facts. No provider or collection.
CREATE TABLE app.success_fee_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,job_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.success_fee_review (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 statement jsonb NOT NULL, statement_hash text NOT NULL CHECK(statement_hash ~ '^[a-f0-9]{64}$'),
 expected_revision integer NOT NULL CHECK(expected_revision>=0), decision_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.success_fee_command(tenant_id,job_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.success_fee_derivation (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, review_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), authorization_id uuid NOT NULL,
 qualifying_numerator text NOT NULL CHECK(qualifying_numerator ~ '^(0|[1-9][0-9]*)$'),
 qualifying_denominator text NOT NULL CHECK(qualifying_denominator ~ '^[1-9][0-9]*$'),
 fee_pence bigint NOT NULL CHECK(fee_pence BETWEEN 0 AND 1000000000000),
 prior_pence bigint NOT NULL CHECK(prior_pence>=0), delta_pence bigint NOT NULL CHECK(delta_pence>=0),
 statement_hash text NOT NULL CHECK(statement_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,revision), UNIQUE(tenant_id,review_id),
 FOREIGN KEY(tenant_id,job_id,review_id) REFERENCES app.success_fee_review(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 CHECK(fee_pence-prior_pence=delta_pence)
);
CREATE TABLE app.success_fee_source (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, derivation_id uuid NOT NULL,
 assessment_id uuid NOT NULL, allocation_id uuid NOT NULL, review_authorization_id uuid NOT NULL,
 case_id uuid NOT NULL, work_id uuid NOT NULL, line_id uuid NOT NULL, lock_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,derivation_id,allocation_id),
 FOREIGN KEY(tenant_id,job_id,derivation_id) REFERENCES app.success_fee_derivation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id,assessment_id) REFERENCES app.recovery_attribution_revision(tenant_id,job_id,case_id,work_id,line_id,lock_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id) REFERENCES app.stored_receipt_case_binding(tenant_id,job_id,case_id,work_id,line_id,lock_id),
 FOREIGN KEY(tenant_id,job_id,allocation_id) REFERENCES app.stored_receipt_case_allocation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,review_authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
CREATE TABLE app.success_fee_journal (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, derivation_id uuid NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence<>0), currency text NOT NULL CHECK(currency='GBP'),
 reverses_journal_id uuid,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,derivation_id),
 FOREIGN KEY(tenant_id,job_id,derivation_id) REFERENCES app.success_fee_derivation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,reverses_journal_id) REFERENCES app.success_fee_journal(tenant_id,job_id,id),
 CHECK((amount_pence>0 AND reverses_journal_id IS NULL) OR (amount_pence<0 AND reverses_journal_id IS NOT NULL)),
 CHECK(id IS DISTINCT FROM reverses_journal_id)
);
CREATE TABLE app.success_fee_journal_line (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, journal_id uuid NOT NULL,
 account text NOT NULL CHECK(account IN('fee_receivable','fee_income')),
 side text NOT NULL CHECK(side IN('debit','credit')), amount_pence bigint NOT NULL CHECK(amount_pence>0),
 PRIMARY KEY(tenant_id,journal_id,account),
 FOREIGN KEY(tenant_id,job_id,journal_id) REFERENCES app.success_fee_journal(tenant_id,job_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['success_fee_command','success_fee_review','success_fee_derivation','success_fee_source','success_fee_journal','success_fee_journal_line'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY success_fee_tenant ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END) WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER success_fee_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
-- Deferred checks run after all lines/sources are appended and roll back the
-- entire command/audit transaction on any incomplete or mismatched posting.
CREATE FUNCTION app.check_success_fee_journal() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=NEW.tenant_id; j uuid; n bigint; debit numeric; credit numeric; lines integer;
BEGIN
 j:=NEW.id;
 SELECT amount_pence INTO n FROM app.success_fee_journal WHERE tenant_id=t AND id=j;
 SELECT count(*),sum(amount_pence) FILTER(WHERE side='debit'),sum(amount_pence) FILTER(WHERE side='credit')
 INTO lines,debit,credit FROM app.success_fee_journal_line WHERE tenant_id=t AND journal_id=j;
 IF lines<>2 OR debit IS DISTINCT FROM abs(n)::numeric OR credit IS DISTINCT FROM abs(n)::numeric
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_journal_line l WHERE l.tenant_id=t AND l.journal_id=j AND l.account='fee_receivable' AND l.side=(CASE WHEN n>0 THEN 'debit' ELSE 'credit' END))
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_derivation d WHERE d.tenant_id=t AND d.id=NEW.derivation_id AND d.job_id=NEW.job_id AND d.delta_pence=n)
 THEN RAISE EXCEPTION 'SUCCESS_FEE_JOURNAL_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.check_success_fee_journal() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.check_success_fee_journal() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
CREATE CONSTRAINT TRIGGER success_fee_balanced AFTER INSERT ON app.success_fee_journal DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app.check_success_fee_journal();
CREATE FUNCTION app.check_success_fee_derivation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n integer; amount numeric;
BEGIN
 SELECT count(*),coalesce(sum(amount_pence),0) INTO n,amount FROM app.success_fee_journal
  WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND derivation_id=NEW.id;
 IF NEW.fee_pence<>app.ef_round_half_even(NEW.qualifying_numerator::numeric,NEW.qualifying_denominator::numeric*10)
 OR NOT EXISTS(SELECT 1 FROM app.success_fee_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND derivation_id=NEW.id)
 OR n<>(CASE WHEN NEW.delta_pence=0 THEN 0 ELSE 1 END) OR amount<>NEW.delta_pence
 OR NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution r
  ON(r.tenant_id,r.id,r.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.authorization_id AND a.action_type='success_fee.post'
   AND a.content_hash=NEW.statement_hash AND a.amount_pence=NEW.delta_pence AND a.currency='GBP'
   AND a.aggregate_revision=NEW.revision-1 AND a.policy_version='reference_fee_policy_v3' AND r.resolution='approved')
 THEN RAISE EXCEPTION 'SUCCESS_FEE_DERIVATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.check_success_fee_derivation() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.check_success_fee_derivation() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
CREATE CONSTRAINT TRIGGER success_fee_complete AFTER INSERT ON app.success_fee_derivation DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app.check_success_fee_derivation();
COMMIT;
