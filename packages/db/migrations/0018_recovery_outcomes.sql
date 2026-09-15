BEGIN;
ALTER POLICY tenant_isolation ON app.evidence_object TO jobguard_runtime,jobguard_migration;
ALTER POLICY tenant_isolation ON app.evidence_invalidation TO jobguard_runtime,jobguard_migration;

CREATE TABLE app.recovery_case(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,claim_pence bigint NOT NULL CHECK(claim_pence>0),currency char(3) NOT NULL CHECK(currency='GBP'),
 state varchar(24) NOT NULL CHECK(state IN('identified','active','partially_landed','landed','prevented')),revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),synthetic boolean NOT NULL CHECK(synthetic),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id)REFERENCES app.job(tenant_id,id));
CREATE TABLE app.synthetic_recovery_receipt(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,source_identity varchar(200) NOT NULL,reconciliation_identity varchar(200) NOT NULL,
 status varchar(16) NOT NULL CHECK(status IN('pending','settled','reversed')),gross_pence bigint NOT NULL CHECK(gross_pence>0),currency char(3) NOT NULL CHECK(currency='GBP'),synthetic boolean NOT NULL CHECK(synthetic),
 settled_at timestamptz,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,reconciliation_identity),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id)REFERENCES app.job(tenant_id,id),CHECK((status='settled' AND settled_at IS NOT NULL)OR status<>'settled'));
CREATE TABLE app.recovery_approval(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,kind varchar(24) NOT NULL CHECK(kind IN('eligibility','landing','fee_statement')),
 expected_case_revision integer NOT NULL CHECK(expected_case_revision>=0),status varchar(12) NOT NULL CHECK(status IN('approved','revoked')),policy_version varchar(80) NOT NULL,
 expires_at timestamptz NOT NULL,command_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id)REFERENCES app.recovery_case(tenant_id,job_id,id));
CREATE TABLE app.landing_allocation(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,receipt_id uuid NOT NULL,evidence_id uuid NOT NULL,
 eligibility_approval_id uuid NOT NULL,landing_approval_id uuid NOT NULL,gross_pence bigint NOT NULL CHECK(gross_pence>0),eligible_net_pence bigint NOT NULL CHECK(eligible_net_pence>0),currency char(3) NOT NULL CHECK(currency='GBP'),policy_version varchar(80) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,receipt_id,case_id,evidence_id),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id)REFERENCES app.recovery_case(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,receipt_id)REFERENCES app.synthetic_recovery_receipt(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,evidence_id)REFERENCES app.evidence_object(tenant_id,id),FOREIGN KEY(tenant_id,eligibility_approval_id)REFERENCES app.recovery_approval(tenant_id,id),FOREIGN KEY(tenant_id,landing_approval_id)REFERENCES app.recovery_approval(tenant_id,id));
CREATE TABLE app.landing_reversal(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,allocation_id uuid NOT NULL,eligible_net_pence bigint NOT NULL CHECK(eligible_net_pence>0),reason varchar(120) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,allocation_id),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,allocation_id)REFERENCES app.landing_allocation(tenant_id,job_id,id));
CREATE TABLE app.recovery_fee_derivation(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,source_allocation_id uuid,source_reversal_id uuid,policy_version varchar(80) NOT NULL,
 cumulative_landed_pence bigint NOT NULL CHECK(cumulative_landed_pence>=0),cap_pence bigint NOT NULL CHECK(cap_pence>=0),capped_fee_pence bigint NOT NULL CHECK(capped_fee_pence>=0),credit_used_pence bigint NOT NULL CHECK(credit_used_pence>=0),liability_pence bigint NOT NULL CHECK(liability_pence>=0),posting_delta_pence bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,source_allocation_id),UNIQUE(tenant_id,source_reversal_id),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,source_allocation_id)REFERENCES app.landing_allocation(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,source_reversal_id)REFERENCES app.landing_reversal(tenant_id,job_id,id),CHECK((source_allocation_id IS NULL)<>(source_reversal_id IS NULL)));
CREATE TABLE app.recovery_fee_journal(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,derivation_id uuid NOT NULL,kind varchar(24) NOT NULL CHECK(kind IN('fee_obligation','compensation')),amount_pence bigint NOT NULL CHECK(amount_pence>0),currency char(3) NOT NULL CHECK(currency='GBP'),
 debit_code varchar(80) NOT NULL,credit_code varchar(80) NOT NULL CHECK(credit_code<>debit_code),reverses_journal_id uuid,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,derivation_id),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,derivation_id)REFERENCES app.recovery_fee_derivation(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,reverses_journal_id)REFERENCES app.recovery_fee_journal(tenant_id,job_id,id),CHECK((kind='fee_obligation' AND reverses_journal_id IS NULL)OR(kind='compensation' AND reverses_journal_id IS NOT NULL)));
CREATE TABLE app.recovery_review(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,derivation_id uuid,reason varchar(40) NOT NULL CHECK(reason IN('evidence_invalidated','landing_reversed','compensation_required')),
 status varchar(12) NOT NULL DEFAULT 'open' CHECK(status='open'),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,job_id,derivation_id)REFERENCES app.recovery_fee_derivation(tenant_id,job_id,id));

CREATE FUNCTION app.half_even_ratio(n bigint,num bigint,den bigint)RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT AS $$DECLARE q bigint;r bigint;BEGIN IF n<0 OR num<0 OR den<=0 THEN RAISE EXCEPTION 'invalid rational';END IF;q:=(n*num)/den;r:=(n*num)%den;IF r*2>den OR(r*2=den AND q%2=1)THEN q:=q+1;END IF;RETURN q;END$$;
CREATE FUNCTION app.approve_synthetic_landing(p jsonb)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c app.recovery_case;r app.synthetic_recovery_receipt;e app.evidence_object;a app.recovery_approval;l uuid:=(p->>'allocationId')::uuid;d uuid:=(p->>'derivationId')::uuid;j uuid:=(p->>'journalId')::uuid;gross bigint:=(p->>'grossPence')::bigint;eligible bigint:=(p->>'eligibleNetPence')::bigint;landed bigint;reversed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;
BEGIN
 IF t IS NULL OR p->>'version'<>'recovery.landing.approve.v1' OR p->>'policyVersion'<>'reference_fee_policy_v1' THEN RAISE EXCEPTION 'synthetic reference command required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=(p->>'jobId')::uuid FOR UPDATE;
 SELECT * INTO c FROM app.recovery_case WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'caseId')::uuid FOR UPDATE;
 SELECT * INTO r FROM app.synthetic_recovery_receipt WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'receiptId')::uuid FOR UPDATE;
 SELECT * INTO e FROM app.evidence_object WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'evidenceId')::uuid AND kind='original';
 IF c.id IS NULL OR NOT c.synthetic OR c.state='prevented' OR c.revision<>(p->>'expectedCaseRevision')::integer THEN RAISE EXCEPTION 'eligible current synthetic case required' USING ERRCODE='42501';END IF;
 IF r.id IS NULL OR NOT r.synthetic OR r.status<>'settled' THEN RAISE EXCEPTION 'settled synthetic receipt required' USING ERRCODE='42501';END IF;
 IF e.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=t AND x.evidence_id=e.id) THEN RAISE EXCEPTION 'verified current evidence required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app.recovery_approval WHERE tenant_id=t AND id=(p->>'eligibilityApprovalId')::uuid AND job_id=c.job_id AND case_id=c.id AND kind='eligibility';
 IF a.id IS NULL OR a.status<>'approved' OR a.policy_version<>'reference_fee_policy_v1' OR a.expected_case_revision<>c.revision OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'current eligibility approval required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app.recovery_approval WHERE tenant_id=t AND id=(p->>'landingApprovalId')::uuid AND job_id=c.job_id AND case_id=c.id AND kind='landing';
 IF a.id IS NULL OR a.status<>'approved' OR a.expected_case_revision<>c.revision OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'current landing approval required' USING ERRCODE='42501';END IF;
 IF gross<=0 OR eligible<=0 OR (SELECT COALESCE(sum(gross_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND receipt_id=r.id)+gross>r.gross_pence OR (SELECT COALESCE(sum(eligible_net_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND case_id=c.id)+eligible>c.claim_pence THEN RAISE EXCEPTION 'allocation exceeds available receipt or claim' USING ERRCODE='23514';END IF;
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

CREATE FUNCTION app.reverse_synthetic_landing(p_tenant uuid,p_reversal uuid,p_derivation uuid,p_journal uuid,p_allocation uuid,p_amount bigint,p_reason varchar)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;x app.landing_allocation;landed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;original uuid;
BEGIN IF t IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501';END IF;SELECT*INTO x FROM app.landing_allocation WHERE tenant_id=t AND id=p_allocation FOR UPDATE;PERFORM 1 FROM app.job WHERE tenant_id=t AND id=x.job_id FOR UPDATE;
 IF x.id IS NULL OR p_amount<=0 OR p_amount>x.eligible_net_pence OR EXISTS(SELECT 1 FROM app.landing_reversal WHERE tenant_id=t AND allocation_id=x.id)THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_reversal VALUES(p_reversal,t,x.job_id,x.id,p_amount,p_reason,DEFAULT);SELECT COALESCE(sum(eligible_net_pence),0)INTO landed FROM app.landing_allocation WHERE tenant_id=t AND job_id=x.job_id;landed:=landed-p_amount;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=x.job_id;fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(7900,fee);liability:=fee-credit;SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(p_derivation,t,x.job_id,NULL,p_reversal,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);INSERT INTO app.recovery_review VALUES(gen_random_uuid(),t,x.job_id,p_derivation,'landing_reversed','open',DEFAULT);
 IF delta<0 THEN SELECT id INTO original FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id AND kind='fee_obligation' ORDER BY created_at LIMIT 1;INSERT INTO app.recovery_fee_journal VALUES(p_journal,t,x.job_id,p_derivation,'compensation',-delta,'GBP','recovery_fee_deferred','recovery_fee_receivable',original,DEFAULT);END IF;RETURN p_derivation;END$$;

CREATE FUNCTION app.reject_recovery_mutation()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'recovery history is append-only' USING ERRCODE='55000';END$$;
CREATE FUNCTION app.review_invalidated_recovery_evidence()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$BEGIN
 INSERT INTO app.recovery_review(id,tenant_id,job_id,derivation_id,reason)
 SELECT gen_random_uuid(),a.tenant_id,a.job_id,d.id,'evidence_invalidated' FROM app.landing_allocation a
 JOIN app.recovery_fee_derivation d ON(d.tenant_id,d.source_allocation_id)=(a.tenant_id,a.id)
 WHERE a.tenant_id=NEW.tenant_id AND a.evidence_id=NEW.evidence_id;
 RETURN NEW;END$$;
CREATE TRIGGER recovery_evidence_invalidated AFTER INSERT ON app.evidence_invalidation FOR EACH ROW EXECUTE FUNCTION app.review_invalidated_recovery_evidence();
ALTER TABLE app.evidence_invalidation ENABLE ALWAYS TRIGGER recovery_evidence_invalidated;
DO $$DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['recovery_case','synthetic_recovery_receipt','recovery_approval','landing_allocation','landing_reversal','recovery_fee_derivation','recovery_fee_journal','recovery_review']LOOP EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);EXECUTE format('CREATE TRIGGER recovery_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_recovery_mutation()',n);END LOOP;END$$;
ALTER FUNCTION app.half_even_ratio(bigint,bigint,bigint)OWNER TO jobguard_migration;ALTER FUNCTION app.approve_synthetic_landing(jsonb)OWNER TO jobguard_migration;ALTER FUNCTION app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,varchar)OWNER TO jobguard_migration;ALTER FUNCTION app.reject_recovery_mutation()OWNER TO jobguard_migration;
ALTER FUNCTION app.review_invalidated_recovery_evidence() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.approve_synthetic_landing(jsonb),app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,varchar)FROM PUBLIC;GRANT EXECUTE ON FUNCTION app.approve_synthetic_landing(jsonb),app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,varchar)TO jobguard_runtime;
COMMIT;
