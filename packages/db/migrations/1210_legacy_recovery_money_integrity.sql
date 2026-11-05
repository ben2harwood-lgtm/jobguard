BEGIN;
-- MIGFIX-6 / M4-8-S, CH-7: legacy v1 only. Restates the latest 0356 bodies.
-- Existing invalid allocations fail migration; never rewrite financial history.
ALTER TABLE app.landing_allocation ADD CONSTRAINT landing_allocation_eligible_within_gross CHECK(eligible_net_pence<=gross_pence);

CREATE OR REPLACE FUNCTION app.approve_synthetic_landing(p jsonb)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c app.recovery_case_current;r app.synthetic_recovery_receipt;e app.evidence_object;a app.recovery_approval;l uuid:=(p->>'allocationId')::uuid;d uuid:=(p->>'derivationId')::uuid;j uuid:=(p->>'journalId')::uuid;gross bigint:=(p->>'grossPence')::bigint;eligible bigint:=(p->>'eligibleNetPence')::bigint;landed bigint;reversed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
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

-- Recompute every allocation less every reversal, with credit only for settled plan fees.
CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing(p_tenant uuid,p_reversal uuid,p_derivation uuid,p_journal uuid,p_allocation uuid,p_amount bigint,p_reason varchar)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;x app.landing_allocation;landed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;original uuid;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF; IF t IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501';END IF;SELECT*INTO x FROM app.landing_allocation WHERE tenant_id=t AND id=p_allocation FOR UPDATE;PERFORM 1 FROM app.job WHERE tenant_id=t AND id=x.job_id FOR UPDATE;
 IF x.id IS NULL OR p_amount<=0 OR p_amount>x.eligible_net_pence OR EXISTS(SELECT 1 FROM app.landing_reversal WHERE tenant_id=t AND allocation_id=x.id)THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_reversal VALUES(p_reversal,t,x.job_id,x.id,p_amount,p_reason,DEFAULT);SELECT COALESCE(sum(a.eligible_net_pence),0)-COALESCE((SELECT sum(r.eligible_net_pence) FROM app.landing_reversal r WHERE r.tenant_id=t AND r.job_id=x.job_id),0) INTO landed FROM app.landing_allocation a WHERE a.tenant_id=t AND a.job_id=x.job_id;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=x.job_id;fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=x.job_id)THEN 7900 ELSE 0 END,fee);liability:=fee-credit;SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(p_derivation,t,x.job_id,NULL,p_reversal,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);INSERT INTO app.recovery_review VALUES(gen_random_uuid(),t,x.job_id,p_derivation,'landing_reversed','open',DEFAULT);
 IF delta<0 THEN SELECT id INTO original FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id AND kind='fee_obligation' ORDER BY created_at LIMIT 1;INSERT INTO app.recovery_fee_journal VALUES(p_journal,t,x.job_id,p_derivation,'compensation',-delta,'GBP','recovery_fee_deferred','recovery_fee_receivable',original,DEFAULT);END IF;RETURN p_derivation;END$$;

COMMIT;
