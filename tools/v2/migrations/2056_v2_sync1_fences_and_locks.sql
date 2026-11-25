-- Q45 / V2-SYNC-1 (migration 2056). Loaded only by the checked V2 bootstrap, outside the shared migration runner.
-- main's QW-1 (0781), QW-4 (0782) and pilot final account (0776) arrive on V2 with this sync.
-- (a) Retarget the snag list's database fence to the V2 rehearsal database, as 2001 does.
-- (b) 0775 and 0777 are left alone on purpose (seed test proves 0777's pilot branch refuses practice jobs).
-- (c) Add 2001's restrictive firm rule to main's new job tables. No grants or main migrations change.
DO $v2$
DECLARE
  routine regprocedure := 'app.snag_practice_actor(uuid,uuid)';
  definition text;
  owner_before oid;
  acl_before aclitem[];
  relation regclass;
  demo_literal text := quote_literal('jobguard_synthetic_demo');
  v2_literal text := quote_literal('jobguard_v2_local');
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2056 requires 2001''s job firm policy';
  END IF;

  -- (a) Snags: the one fence 0782 adds. Same pattern as 2001; owner and ACL must not move.
  SELECT proowner, proacl INTO owner_before, acl_before FROM pg_proc WHERE oid = routine;
  definition := pg_get_functiondef(routine);
  IF strpos(definition, v2_literal) = 0 AND strpos(definition, demo_literal) > 0 THEN
    EXECUTE overlay(definition PLACING v2_literal FROM strpos(definition, demo_literal) FOR length(demo_literal));
  ELSIF strpos(definition, v2_literal) = 0 THEN
    RAISE EXCEPTION 'Expected local database fence missing in %', routine;
  END IF;
  IF strpos(pg_get_functiondef(routine), demo_literal) > 0 THEN
    RAISE EXCEPTION 'More than one database fence in %', routine;
  END IF;
  IF (SELECT (proowner, proacl) IS DISTINCT FROM (owner_before, acl_before) FROM pg_proc WHERE oid = routine) THEN
    RAISE EXCEPTION 'Retargeting % changed its owner or privileges', routine;
  END IF;

  -- (c) main's new job tables (0781, 0782): visible and writable only when the firm can see the job.
  FOREACH relation IN ARRAY ARRAY[
    'app.snag_command',
    'app.snag',
    'app.snag_revision',
    'app.snag_event',
    'app.snag_photo',
    'app.snag_photo_upload',
    'app.variation_revision_photo'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;

  -- 0776's pilot_final_check_terms_approval is per tenant, with no job_id, so 2001's job rule
  -- cannot bind it. jobguard_runtime has no privilege and no policy on it; refuse if that changes.
  IF has_table_privilege('jobguard_runtime', 'app.pilot_final_check_terms_approval', 'SELECT,INSERT,UPDATE,DELETE')
    OR EXISTS (SELECT FROM pg_policy p WHERE p.polrelid = 'app.pilot_final_check_terms_approval'::regclass
      AND ('jobguard_runtime'::regrole::oid = ANY (p.polroles) OR p.polroles = '{0}')) THEN
    RAISE EXCEPTION 'V2 migration 2056: jobguard_runtime can reach app.pilot_final_check_terms_approval';
  END IF;
END
$v2$;
