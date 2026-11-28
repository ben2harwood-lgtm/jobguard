-- Q89 / V2-FL-JOB. app.job's V2 firm lock (2001) let every job with no practice_session_digest through, and that is
-- how an imported job is stored. Every table locked "through a visible job" (2001, 2025, 2047, 2068, 2089 and the
-- photo lock) inherited the opening, so a second firm sharing the practice tenant could read another firm's imported
-- job and its rows. 2090 replaces only app.job's own v2_practice_firm policy: in the shared practice tenant an imported
-- job is visible only to the firm that owns it, decided by the owned-job walk 0734 and practiceOwnedJobsSql use. An
-- imported job with no owner is visible to no practice firm. WITH CHECK is the same rule, so runtime can't write an
-- imported job it doesn't own either; imports are written by main's checked definer, which this policy doesn't apply to.
-- Nothing here changes main's policies, lp6 or any indirect lock.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- Does the bound practice firm own this imported job? The walk is 0734's (and packages/db practiceOwnedJobsSql's),
  -- from the firm's own jobs through job_import_v3, or v1's frozen parties plus its succeeded adopt receipt. Definer,
  -- so the walk reads app.job without its own policy (no recursion); it reads only and returns a boolean.
  CREATE OR REPLACE FUNCTION app.v2_firm_owns_imported_job(t uuid, j uuid)
  RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $fn$
  DECLARE
    firm text := app.current_firm_profile_key();
    d text;
    owned boolean;
  BEGIN
    IF t IS NULL OR j IS NULL OR firm IS NULL OR left(firm, 9) <> 'practice:' THEN RETURN false; END IF;
    d := substr(firm, 10);
    WITH RECURSIVE owned_job(id) AS (
      SELECT id FROM app.job WHERE tenant_id = t AND practice_session_digest = d
      UNION
      SELECT next_job.id FROM owned_job source JOIN app.job next_job ON next_job.tenant_id = t
        AND next_job.provenance = 'imported' AND next_job.practice_session_digest IS NULL
      WHERE EXISTS (SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id = t AND i.job_id = next_job.id AND i.source_job_id = source.id)
      OR EXISTS (SELECT 1 FROM app.imported_job_baseline ib
        JOIN app.job_party_binding imported ON (imported.tenant_id, imported.job_id, imported.id) = (ib.tenant_id, ib.job_id, ib.party_binding_id)
        JOIN app.job_party_binding origin ON origin.tenant_id = t AND origin.job_id = source.id
          AND origin.customer_revision_id = imported.customer_revision_id AND origin.site_revision_id = imported.site_revision_id
          AND origin.paying_party_revision_id = imported.paying_party_revision_id
        WHERE ib.tenant_id = t AND ib.job_id = next_job.id AND NOT EXISTS (SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id = t AND i.job_id = next_job.id)
          AND EXISTS (SELECT 1 FROM app.command_receipt rc WHERE rc.tenant_id = t AND rc.command_type = 'job.adopt_in_flight' AND rc.status = 'succeeded'
            AND rc.semantic_key = 'import:' || next_job.id::text AND rc.result->>'jobId' = next_job.id::text AND rc.result->>'sourceJobId' = source.id::text))
    ) SELECT EXISTS (SELECT 1 FROM owned_job WHERE id = j) INTO owned;
    RETURN owned;
  END
  $fn$;
  REVOKE ALL ON FUNCTION app.v2_firm_owns_imported_job(uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_firm_owns_imported_job(uuid, uuid) TO jobguard_runtime;

  -- 2001's rule, except an imported job in the shared practice tenant must be the bound firm's own, for reads and writes.
  DROP POLICY v2_practice_firm ON app.job;
  CREATE POLICY v2_practice_firm ON app.job AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (CASE WHEN practice_session_digest IS NOT NULL
        THEN app.current_firm_profile_key() = 'practice:' || practice_session_digest
      WHEN provenance = 'imported' AND tenant_id = '11111111-1111-4111-8111-111111111111'::uuid
        THEN app.v2_firm_owns_imported_job(tenant_id, id)
      ELSE true END)
    WITH CHECK (CASE WHEN practice_session_digest IS NOT NULL
        THEN app.current_firm_profile_key() = 'practice:' || practice_session_digest
      WHEN provenance = 'imported' AND tenant_id = '11111111-1111-4111-8111-111111111111'::uuid
        THEN app.v2_firm_owns_imported_job(tenant_id, id)
      ELSE true END);
END
$v2$;
COMMIT;
