BEGIN;
-- Fixed synthetic v1 fixture only. No financial writes, new roles or grants.
-- Retain the existing signature, owner, ACL, RLS and immutable source schema.
CREATE OR REPLACE FUNCTION app.create_fee_illustration_source(p_job uuid,p_command uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE
 t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 prior app.fee_illustration_source;
BEGIN
 -- This retained synthetic bridge uses the fixed DEMO principal, never a client actor.
 -- The routine carries its own current owner-role check before examining any job.
 IF t IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN
  RAISE EXCEPTION 'FEE_ILLUSTRATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM app.membership
  WHERE tenant_id=t AND id='d1500000-0000-4000-8000-000000000003'::uuid
   AND identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
   AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
  FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEE_ILLUSTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_job IS NULL OR p_command IS NULL THEN
  RAISE EXCEPTION 'INVALID_ILLUSTRATION_COMMAND' USING ERRCODE='22023';
 END IF;
 -- One command lock, then one job lock: serialize both uniqueness dimensions.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('fee-illustration:'||p_command::text));
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track c ON (c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND c.job_track='small_builder' AND c.environment='synthetic_demo'
  FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEE_ILLUSTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;

 SELECT * INTO prior FROM app.fee_illustration_source WHERE tenant_id=t AND command_id=p_command;
 IF FOUND THEN
  IF prior.job_id IS DISTINCT FROM p_job OR prior.source_version<>'recovery-18800.v1' THEN
   RAISE EXCEPTION 'FEE_ILLUSTRATION_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM app.fee_illustration_source WHERE tenant_id=t AND job_id=p_job) THEN
  RAISE EXCEPTION 'FEE_ILLUSTRATION_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO app.fee_illustration_source(tenant_id,job_id,command_id,source_version,accepted_net_pence,eligible_net_pence,gross_landed_pence,base_obligation_pence,base_settled_pence,prior_posting_pence,source_ids)
 VALUES(t,p_job,p_command,'recovery-18800.v1',1880000,282000,338400,7900,7900,20300,ARRAY[gen_random_uuid(),gen_random_uuid()]);
END $$;
COMMIT;
