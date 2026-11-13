BEGIN;

-- LATER-SAFETY-143: v1 receipts confer the same ancestry as the trusted v3 writer.
-- Keep 0690's receipt predicate verbatim; source is the requested parent identity.
CREATE FUNCTION app.trusted_import_edge(t uuid,child uuid,parent uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.job job CROSS JOIN (SELECT parent AS id) source
  WHERE job.tenant_id=t AND job.id=child AND job.provenance='imported' AND job.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source.id::text))
 )
$$;
ALTER FUNCTION app.trusted_import_edge(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.trusted_import_edge(uuid,uuid,uuid)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

-- 0667's v3-only walk did not constrain provenance or digest. Preserve that branch.
-- UNION retains cycle safety; the anchor, security attributes and ACL are unchanged.
CREATE OR REPLACE FUNCTION app.final_check_practice_owns_job(t uuid,j uuid,d text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 WITH RECURSIVE owned(id) AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION
  SELECT child.id FROM owned o JOIN app.job child ON child.tenant_id=t
   AND (EXISTS(SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.job_id=child.id AND i.source_job_id=o.id)
    OR app.trusted_import_edge(t,child.id,o.id))
 )
 SELECT EXISTS(SELECT 1 FROM owned WHERE id=j)
$$;
ALTER FUNCTION app.final_check_practice_owns_job(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_practice_owns_job(uuid,uuid,text)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

-- Forward fix only: do not restore the v3-only ownership walk.
COMMIT;
