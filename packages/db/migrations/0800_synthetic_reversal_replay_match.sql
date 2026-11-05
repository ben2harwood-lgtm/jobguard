-- LATER-SAFETY-30 (RED): bind synthetic v1 reversal replays to stored payloads.
BEGIN;

CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing(p_tenant uuid,p_reversal uuid,p_derivation uuid,p_journal uuid,p_allocation uuid,p_amount bigint,p_reason varchar)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;x app.landing_allocation;existing app.landing_reversal;replay uuid;landed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;original uuid;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF; IF t IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501';END IF;
 -- Serialize reuse of the tenant/reversal identity, including different jobs.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('synthetic_reversal:'||p_reversal::text));
 SELECT * INTO existing FROM app.landing_reversal WHERE tenant_id=t AND id=p_reversal;
 IF existing.id IS NOT NULL THEN
  IF existing.allocation_id IS DISTINCT FROM p_allocation OR existing.eligible_net_pence IS DISTINCT FROM p_amount OR existing.reason IS DISTINCT FROM p_reason THEN
   RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';
  END IF;
  SELECT id INTO replay FROM app.recovery_fee_derivation WHERE tenant_id=t AND source_reversal_id=p_reversal;
  IF replay IS NULL OR replay IS DISTINCT FROM p_derivation OR EXISTS(
   SELECT 1 FROM app.recovery_fee_journal WHERE tenant_id=t AND derivation_id=replay AND kind='compensation' AND id IS DISTINCT FROM p_journal
  ) THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
  RETURN replay;
 END IF;
 SELECT*INTO x FROM app.landing_allocation WHERE tenant_id=t AND id=p_allocation FOR UPDATE;PERFORM 1 FROM app.job WHERE tenant_id=t AND id=x.job_id FOR UPDATE;
 IF x.id IS NULL OR p_amount<=0 OR p_amount>x.eligible_net_pence OR EXISTS(SELECT 1 FROM app.landing_reversal WHERE tenant_id=t AND allocation_id=x.id)THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_reversal VALUES(p_reversal,t,x.job_id,x.id,p_amount,p_reason,DEFAULT);SELECT COALESCE(sum(eligible_net_pence),0)INTO landed FROM app.landing_allocation WHERE tenant_id=t AND job_id=x.job_id;landed:=landed-(SELECT COALESCE(sum(eligible_net_pence),0) FROM app.landing_reversal WHERE tenant_id=t AND job_id=x.job_id);SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=x.job_id AND fee_policy_version='reference_fee_policy_v1';fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(7900,fee);liability:=fee-credit;SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(p_derivation,t,x.job_id,NULL,p_reversal,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);INSERT INTO app.recovery_review VALUES(gen_random_uuid(),t,x.job_id,p_derivation,'landing_reversed','open',DEFAULT);
 IF delta<0 THEN SELECT id INTO original FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id AND kind='fee_obligation' ORDER BY created_at LIMIT 1;INSERT INTO app.recovery_fee_journal VALUES(p_journal,t,x.job_id,p_derivation,'compensation',-delta,'GBP','recovery_fee_deferred','recovery_fee_receivable',original,DEFAULT);END IF;RETURN p_derivation;END$$;

-- CREATE OR REPLACE preserves the existing owner and EXECUTE grants.
COMMIT;
