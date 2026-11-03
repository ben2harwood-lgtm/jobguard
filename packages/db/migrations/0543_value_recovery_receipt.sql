BEGIN;
-- CH-9 RED, read-only. Preserve the latest v1 refusal/lock path verbatim by
-- delegation. Forward-fix by replacing this reader; no data or writer changes.
CREATE FUNCTION app.read_value_job_v2(j uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 base jsonb; live jsonb; history jsonb:='[]'; d record;
 reason text:='No approved v3 derivation with settled allocation sources';
 supplier jsonb:=jsonb_build_object('reason','No approved supplier v3 derivation with settled allocation sources','balances','[]'::jsonb);
BEGIN
 -- Authentication, tenant/job ownership, synthetic track and pre-lock refusal
 -- all precede any allocation/derivation read, including unavailable reasons.
 base:=app.read_value_job(j,digest);
 IF base IS NULL THEN RETURN NULL; END IF;
 IF t IS NULL OR base->>'tenantId' IS DISTINCT FROM t::text OR base->>'jobId' IS DISTINCT FROM j::text
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Fee derivations are whole-job cumulative balances. Never invent a split of
 -- a rounded fee across mixed categories. Those jobs remain unavailable until
 -- a category-specific derivation source exists.
 IF EXISTS(SELECT 1 FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=j)
 AND NOT EXISTS(SELECT 1 FROM app.success_fee_derivation x WHERE x.tenant_id=t AND x.job_id=j
  AND (NOT EXISTS(SELECT 1 FROM app.success_fee_source s WHERE s.tenant_id=t AND s.job_id=j AND s.derivation_id=x.id)
   OR EXISTS(SELECT 1 FROM app.success_fee_source s LEFT JOIN app.recovery_case_current c
    ON(c.tenant_id,c.job_id,c.id)=(s.tenant_id,s.job_id,s.case_id)
    WHERE s.tenant_id=t AND s.job_id=j AND s.derivation_id=x.id
    AND (s.recovery_allocation_id IS NULL OR c.case_type IS DISTINCT FROM 'withheld_customer_payment'))))
 -- Newly allocated receipts need their own current approved derivation too.
 AND NOT EXISTS(SELECT 1 FROM app.recovery_case_allocation ca JOIN app.recovery_case_current c
  ON(c.tenant_id,c.job_id,c.id)=(ca.tenant_id,ca.job_id,ca.case_id)
  WHERE ca.tenant_id=t AND ca.job_id=j AND c.case_type='withheld_customer_payment'
  AND NOT EXISTS(SELECT 1 FROM app.success_fee_source s JOIN app.success_fee_derivation x
   ON(x.tenant_id,x.job_id,x.id)=(s.tenant_id,s.job_id,s.derivation_id)
   WHERE s.tenant_id=t AND s.job_id=j AND s.recovery_allocation_id=ca.id
   AND x.revision=(SELECT max(revision) FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=j))) THEN
  BEGIN
   -- Revalidate settled allocations, reversals, proof and the approved current
   -- statement through the existing source authority, never another fee formula.
   live:=app.platform_fee_statement_sources(t,j,(SELECT r.actor_membership_id FROM app.success_fee_derivation x
    JOIN app.success_fee_review r ON(r.tenant_id,r.job_id,r.id)=(x.tenant_id,x.job_id,x.review_id)
    WHERE x.tenant_id=t AND x.job_id=j ORDER BY x.revision DESC LIMIT 1));
   FOR d IN SELECT x.*,a.created_at FROM app.success_fee_derivation x JOIN app.action_authorization a
    ON(a.tenant_id,a.id)=(x.tenant_id,x.authorization_id)
    WHERE x.tenant_id=t AND x.job_id=j ORDER BY x.revision LOOP
    IF mod(d.qualifying_numerator::numeric,d.qualifying_denominator::numeric)<>0
    THEN RAISE EXCEPTION 'VALUE_FRACTIONAL_PRINCIPAL' USING ERRCODE='23514'; END IF;
    history:=history||jsonb_build_array(jsonb_build_object('tenantId',t,'jobId',j,'derivationId',d.id,'revision',d.revision,
     'at',to_char(d.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
     'recovered',jsonb_build_object('pence',(d.qualifying_numerator::numeric/d.qualifying_denominator::numeric)::bigint,'currency','GBP'),
     'fee',jsonb_build_object('pence',d.fee_pence,'currency','GBP'),'statementHash',d.statement_hash,
     'allocationIds',(SELECT jsonb_agg(s.recovery_allocation_id ORDER BY s.recovery_allocation_id)
      FROM app.success_fee_source s WHERE s.tenant_id=t AND s.job_id=j AND s.derivation_id=d.id)));
   END LOOP;
   IF live->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('numerator',d.qualifying_numerator,'denominator',d.qualifying_denominator)
    OR (live->>'feePence')::bigint IS DISTINCT FROM d.fee_pence
   THEN reason:='The changed sources need a current approved v3 derivation';
   ELSE reason:=NULL; END IF;
  EXCEPTION WHEN check_violation OR serialization_failure OR feature_not_supported THEN
   reason:='The recovery sources need a current approved v3 derivation'; history:='[]';
  END;
 END IF;
 RETURN jsonb_build_object('base',base,'supplier',supplier,'withheld',jsonb_build_object('reason',reason,'balances',history));
END $$;
ALTER FUNCTION app.read_value_job_v2(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_value_job_v2(uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.read_value_job_v2(uuid,text) TO jobguard_runtime;
COMMIT;
