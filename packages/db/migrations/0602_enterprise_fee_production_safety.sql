BEGIN;
-- M4-9 production-policy preparation, DARK. No release/policy approval is created here.
-- The shared kernel remains synthetic-only. Production commands fail before reading any tenant data.
CREATE FUNCTION app.ef_production_command(p_session uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- No client flag, GUC, statement approval or reference agreement can substitute for G4-C and approved D16.
 -- Activating production requires a reviewed source/session adapter and approved policy migration.
 RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501';
END $$;
ALTER FUNCTION app.ef_production_command(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_production_command(uuid,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_production_command(uuid,jsonb) TO jobguard_runtime;

-- Verify both the exact total and allocation-level attribution by rebuilding from immutable billing events.
-- Private helper: the caller already holds the tenant billing fence, before the audit-head lock.
CREATE FUNCTION app.ef_assert_rebuild(t uuid,p_derivation uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d app.enterprise_fee_derivation; ag app.enterprise_agreement_version; fx jsonb; stored jsonb;
 acc numeric[]:=ARRAY[0::numeric,1::numeric]; r record;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO d FROM app.enterprise_fee_derivation WHERE tenant_id=t AND id=p_derivation;
 SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=d.agreement_version_id;
 IF d.id IS NULL OR ag.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 fx:=app.ef_inputs(t,ag,d.period);
 SELECT coalesce(jsonb_agg(jsonb_build_object('allocation_id',c.allocation_id,'run_id',c.run_id,'rule',c.rule,
  'n',c.qualifying_numerator::text,'dd',c.qualifying_denominator::text,'export_line_id',c.export_line_id,
  'job_id',c.job_id,'extra_id',c.extra_id,'origin_kind',c.origin_kind) ORDER BY c.allocation_id),'[]'::jsonb)
 INTO stored FROM app.enterprise_fee_contribution c WHERE c.tenant_id=t AND c.derivation_id=d.id;
 FOR r IN SELECT (x->>'n')::numeric n,(x->>'dd')::numeric dd FROM jsonb_array_elements(fx->'rows') x LOOP
  acc:=app.cb_add(acc[1],acc[2],r.n,r.dd);
 END LOOP;
 IF fx->>'hash' IS DISTINCT FROM d.input_hash OR stored IS DISTINCT FROM fx->'rows'
  OR (fx->>'cutoff')::timestamptz IS DISTINCT FROM d.recorded_cutoff
  OR acc[1]*d.qualifying_denominator<>d.qualifying_numerator*acc[2]
  OR app.ef_round_half_even(acc[1]*ag.rate_numerator,acc[2]*ag.rate_denominator)<>d.cumulative_fee_pence THEN
  RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001';
 END IF;
END $$;
ALTER FUNCTION app.ef_assert_rebuild(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_assert_rebuild(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- Structural defence for the shared book: a derivation cannot be posted above its rebuilt entitlement,
-- nor can a compensation consume another tenant/agreement's accrual or the same outstanding pence twice.
CREATE FUNCTION app.ef_posting_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE sec app.enterprise_fee_statement_section; original app.platform_enterprise_fee; net bigint; consumed bigint; rebuilt_fee bigint;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 -- ef_post_statement has already acquired the tenant billing fence (618). Agreement lock is independent of
 -- statement month and client contract; all inserts, including compensation splits, share it before auditing.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.agreement_version_id::text,749));
 SELECT * INTO sec FROM app.enterprise_fee_statement_section WHERE tenant_id=NEW.tenant_id
  AND statement_id=NEW.statement_id AND agreement_version_id=NEW.agreement_version_id;
 IF sec.statement_id IS NULL OR sec.derivation_id<>NEW.derivation_id OR NEW.environment<>'synthetic_demo' THEN
  RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023';
 END IF;
 PERFORM app.ef_assert_rebuild(NEW.tenant_id,NEW.derivation_id);
 SELECT cumulative_fee_pence INTO rebuilt_fee FROM app.enterprise_fee_derivation
  WHERE tenant_id=NEW.tenant_id AND id=NEW.derivation_id;
 IF rebuilt_fee IS DISTINCT FROM sec.cumulative_fee_pence THEN RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001'; END IF;
 net:=app.ef_posted_net(NEW.tenant_id,NEW.agreement_version_id);
 IF NEW.kind='accrual' THEN
  IF NEW.amount_pence>sec.cumulative_fee_pence-net OR NEW.compensates_fee_id IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023';
  END IF;
 ELSE
  SELECT * INTO original FROM app.platform_enterprise_fee WHERE tenant_id=NEW.tenant_id AND id=NEW.compensates_fee_id;
  SELECT coalesce(sum(amount_pence),0) INTO consumed FROM app.platform_enterprise_fee
   WHERE tenant_id=NEW.tenant_id AND compensates_fee_id=original.id;
  IF original.id IS NULL OR original.kind<>'accrual' OR original.agreement_version_id<>NEW.agreement_version_id
   OR NEW.amount_pence>original.amount_pence-consumed OR NEW.amount_pence>net-sec.cumulative_fee_pence THEN
   RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.ef_posting_integrity() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_posting_integrity() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER ef_posting_integrity BEFORE INSERT ON app.platform_enterprise_fee
 FOR EACH ROW EXECUTE FUNCTION app.ef_posting_integrity();
COMMIT;
