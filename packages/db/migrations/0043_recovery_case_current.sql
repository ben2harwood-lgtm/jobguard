BEGIN;
-- The original columns are immutable creation snapshots for 0018 legacy cases.
-- For workbench cases, claims/events are authoritative. All current-state readers
-- (including the 0018 landing routine) use this invoker/RLS projection.
COMMENT ON COLUMN app.recovery_case.state IS 'Legacy creation snapshot only; read recovery_case_current.state for current state.';
COMMENT ON COLUMN app.recovery_case.claim_pence IS 'Legacy creation snapshot only; read recovery_case_current.claim_pence for current claim.';
COMMENT ON COLUMN app.recovery_case.revision IS 'Legacy creation snapshot only; read recovery_case_current.revision for current revision.';
CREATE VIEW app.recovery_case_current WITH (security_invoker=true) AS
SELECT c.id,c.tenant_id,c.job_id,
 CASE WHEN q.id IS NULL THEN c.claim_pence ELSE q.claimed_net_pence END AS claim_pence,
 c.currency,CASE WHEN q.id IS NULL THEN c.state ELSE e.to_state END AS state,
 CASE WHEN q.id IS NULL THEN c.revision ELSE q.revision+s.event_count END AS revision,
 c.synthetic,c.created_at,c.case_type,c.counterparty,c.book,c.source_type,c.source_refs,c.environment,
 q.revision AS claim_revision,s.event_count,e.payload_hash AS previous_hash,
 e.reviewer_ref,greatest(s.manual_landed,a.approved_landed) AS landed,s.manual_landed,a.approved_landed,s.written_off
FROM app.recovery_case c
LEFT JOIN LATERAL (SELECT * FROM app.recovery_claim_revision q WHERE q.tenant_id=c.tenant_id AND q.case_id=c.id ORDER BY revision DESC LIMIT 1) q ON true
LEFT JOIN LATERAL (SELECT * FROM app.recovery_case_event e WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id ORDER BY sequence DESC LIMIT 1) e ON true
CROSS JOIN LATERAL (
 SELECT count(*)::integer AS event_count,
 coalesce(sum(CASE WHEN event_type='record_landing' THEN amount_pence WHEN event_type='reverse_landing' THEN -amount_pence ELSE 0 END),0) AS manual_landed,
 coalesce(sum(CASE WHEN event_type='write_off' THEN amount_pence ELSE 0 END),0) AS written_off
 FROM app.recovery_case_event s WHERE s.tenant_id=c.tenant_id AND s.case_id=c.id
) s
CROSS JOIN LATERAL (
 -- Principal approved through the landing routine, net of approved reversals. It is the same money a builder may also
 -- have recorded by hand, so the received principal is the LARGER of the two figures, never their sum.
 SELECT coalesce((SELECT sum(x.eligible_net_pence) FROM app.landing_allocation x WHERE x.tenant_id=c.tenant_id AND x.case_id=c.id),0)
      - coalesce((SELECT sum(r.eligible_net_pence) FROM app.landing_reversal r JOIN app.landing_allocation x ON(x.tenant_id,x.id)=(r.tenant_id,r.allocation_id) WHERE r.tenant_id=c.tenant_id AND x.case_id=c.id),0) AS approved_landed
) a
-- A partially written workbench history cannot fall back to a legacy snapshot.
WHERE (q.id IS NULL AND e.id IS NULL) OR (q.id IS NOT NULL AND e.id IS NOT NULL);
ALTER VIEW app.recovery_case_current OWNER TO jobguard_migration;
REVOKE ALL ON app.recovery_case_current FROM PUBLIC;
GRANT SELECT ON app.recovery_case_current TO jobguard_runtime;
COMMENT ON VIEW app.recovery_case_current IS 'Authoritative live case state/claim/revision. Legacy fallback only when there is no workbench history. Uses caller privileges and forced tenant RLS.';

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
 IF gross<=0 OR eligible<=0 OR (SELECT COALESCE(sum(gross_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND receipt_id=r.id)+gross>r.gross_pence OR (SELECT COALESCE(sum(eligible_net_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND case_id=c.id)+eligible>c.claim_pence-c.written_off THEN RAISE EXCEPTION 'allocation exceeds available receipt or claim' USING ERRCODE='23514';END IF;
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

-- CREATE OR REPLACE retains the existing narrow EXECUTE grant; no new definer.
COMMIT;
