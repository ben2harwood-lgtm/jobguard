-- V2-E2 fact reply firm lock (migration 2066). Loaded only by the checked V2 bootstrap, outside the shared migration runner.
-- V2's linked practice firms share one backing tenant, so 2030's tenant RLS doesn't separate them.
-- Add 2001's restrictive firm rule to the five fact reply tables, as 2047 does for the V2 core tables.
-- Policies are created only when missing; no grants, other policies or main migrations change.
DO $v2$
DECLARE
  relation regclass;
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2066 requires 2001''s job firm policy';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.v2_fact_reply', 'app.v2_fact_reply_applied', 'app.v2_fact_reply_cancel', 'app.v2_fact_reply_request', 'app.v2_reply_recipient'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;
END
$v2$;
