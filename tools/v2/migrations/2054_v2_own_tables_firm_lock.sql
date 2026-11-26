-- Q44 / V2-FL-6. Loaded last by the checked V2 bootstrap, outside the shared migration runner.
-- Discover V2-owned job tables, including tables added by later-integrated pieces.
DO $v2$
DECLARE
  relation record;
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2054 requires 2001''s job firm policy';
  END IF;

  FOR relation IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p')
      AND c.relname LIKE 'v2\_%' ESCAPE '\'
      AND EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'job_id' AND NOT a.attisdropped)
      AND NOT EXISTS (SELECT FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'v2_practice_firm')
    ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE POLICY v2_practice_firm ON app.%I AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%I.tenant_id,%I.job_id)))',
      relation.relname, relation.relname, relation.relname);
  END LOOP;
END
$v2$;
