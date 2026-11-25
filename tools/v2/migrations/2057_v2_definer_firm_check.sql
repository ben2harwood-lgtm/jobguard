-- V2-FL-FX (migration 2057). Loaded only by the checked V2 bootstrap, outside the shared migration runner.
-- FL-F (#978) found two runtime-callable definers that check the tenant but not the firm. V2's practice
-- firms share one tenant, so firm B could read firm A's party snapshot and learn that its job is live.
-- Same signatures, owner, grants and bodies as main's latest definitions (0749 / 0765); the only change is
-- that the job lookup also applies 2001's app.job firm rule. A job of another firm reads as missing.
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2057 requires 2001''s job firm policy';
  END IF;
END
$v2$;

CREATE OR REPLACE FUNCTION app.require_current_job_parties(p_tenant uuid, p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE snapshot jsonb; BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- V2-FL-FX: 2001's app.job firm rule; another firm's job reads as missing.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job
  AND (practice_session_digest IS NULL OR coalesce(app.current_firm_profile_key()='practice:'||practice_session_digest,false)) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT s.snapshot INTO snapshot FROM app.job_party_snapshot s JOIN app.job_party_current x ON(x.tenant_id,x.binding_id)=(s.tenant_id,s.binding_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 RETURN snapshot;
END;
END
$function$;

CREATE OR REPLACE FUNCTION app.require_watchdog_live(p_job uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE delegated boolean;
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 -- Customer evidence triggers retain the customer's existing LP-6c request, scoped
 -- to this tenant, job and command. A NULL actor alone never grants access.
 delegated := app.current_actor() IS NULL AND app.lp6d_has_delegated_scope('JobSource.customer_message',p_job);
 IF NOT delegated THEN
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 END IF;
DECLARE tenant uuid; lifecycle text;
BEGIN
  tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  IF tenant IS NULL THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  -- V2-FL-FX: 2001's app.job firm rule on the member path; another firm's job reads as missing.
  -- The delegated customer-message path is already scoped to this job and command.
  SELECT status INTO lifecycle FROM app.job WHERE tenant_id=tenant AND id=p_job
   AND (delegated OR practice_session_digest IS NULL
    OR coalesce(app.current_firm_profile_key()='practice:'||practice_session_digest,false)) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF lifecycle <> 'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='P0001'; END IF;
END;
END
$function$;
