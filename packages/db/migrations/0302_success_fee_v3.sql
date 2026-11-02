BEGIN;
-- M4-9-S / C258: dependency boundary only. No fee fact can be written until
-- SV-6 supplies its accepted source/proof adapter. No replacement allocator.
CREATE FUNCTION app.read_success_fee_v3(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE THEN
  RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session,t);
 IF actor.membership_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor.membership_id
   AND m.identity_user_id=actor.identity_user_id AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ) THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND j.practice_session_digest=p_session
   AND j.fee_policy_version='reference_fee_policy_v3'
   AND c.job_track='small_builder' AND c.environment='synthetic_demo'
 ) THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- No shadow, attribution, allocation, evidence, review or ledger read occurs.
 RETURN jsonb_build_object('version','success-fee-availability.v1','jobId',p_job,
  'environment','synthetic_demo','state','dependency_bound',
  'dependency','accepted_attribution_source_adapter','productionEnabled',false,'realExternalActions',0);
END $$;
ALTER FUNCTION app.read_success_fee_v3(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_success_fee_v3(uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.read_success_fee_v3(uuid,text) TO jobguard_runtime;

CREATE FUNCTION app.write_success_fee_v3(p_job uuid,p_session text,p_command jsonb,p_artifact jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Independently reauthenticate even for direct SQL/replay attempts. The public
 -- read boundary contains no business writes and exposes no protected sources.
 PERFORM app.read_success_fee_v3(p_job,p_session);
 -- A supplied artifact/hash/approval is never authority. No command is claimed,
 -- no audit head is acquired, and no economic result is retained on refusal.
 RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000';
END $$;
ALTER FUNCTION app.write_success_fee_v3(uuid,text,jsonb,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_success_fee_v3(uuid,text,jsonb,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.write_success_fee_v3(uuid,text,jsonb,jsonb) TO jobguard_runtime;
COMMIT;
