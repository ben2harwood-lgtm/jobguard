-- LP-3 RED: forward fix from the latest 0519 checked routine body.
-- The approval issuer stores command.action.contentHash verbatim. For settlement
-- commands this is lp3MutationHash: the same canonical payload reconstructed below.
-- No grants, signatures, legacy routines or production gates change.
BEGIN;
CREATE OR REPLACE FUNCTION app.record_simulated_settlement(p_tenant uuid,p_id uuid,p_obligation uuid,p_provider_event varchar,p_amount bigint,p_simulated_at timestamptz,p_actor uuid,p_command uuid,p_authorization uuid) RETURNS app.simulated_settlement_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.simulated_settlement_event; payload text;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=(SELECT job_id FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation) FOR UPDATE;
 IF p_amount IS DISTINCT FROM 7900 OR p_provider_event IS NULL OR length(p_provider_event) NOT BETWEEN 1 AND 200 OR p_simulated_at IS NULL OR p_simulated_at IS DISTINCT FROM date_trunc('milliseconds',p_simulated_at) OR NOT EXISTS(SELECT 1 FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation AND principal_pence=7900 AND currency='GBP' AND state='owed_unpaid') OR EXISTS(SELECT 1 FROM app.simulated_settlement_event WHERE tenant_id=p_tenant AND obligation_id=p_obligation) THEN RAISE EXCEPTION 'synthetic obligation required' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','synthetic.settlement',p_tenant::text,p_actor::text,p_obligation::text,p_obligation::text,p_provider_event,p_amount::text,'GBP','synthetic_demo_illustrative.v1',to_char(p_simulated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'synthetic.settlement','synthetic_obligation.simulate_settlement','synthetic_obligation',p_obligation::text,payload,1,p_amount,'GBP',NULL,'synthetic_demo_illustrative.v1',payload,(SELECT job_id FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation),NULL);
 SELECT * INTO result FROM app.record_simulated_settlement(p_tenant,p_id,p_obligation,p_provider_event,p_amount,p_simulated_at);
 RETURN result;
END $$;
ALTER FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz,uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz,uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
