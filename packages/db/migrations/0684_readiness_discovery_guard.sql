BEGIN;
-- Identifier-only discovery. FORCE RLS remains active: enumerate the control-plane
-- identities, then read each tenant under the owner's existing tenant policy.
CREATE OR REPLACE FUNCTION infrastructure.discover_readiness_plans()
RETURNS TABLE(tenant_id uuid,job_id uuid,task_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 previous_tenant text := current_setting('app.tenant_id',true);
 tenant uuid;
 emitted integer := 0;
 added integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 FOR tenant IN SELECT t.id FROM control_plane.tenant t ORDER BY t.id LOOP
  PERFORM set_config('app.tenant_id',tenant::text,true);
  RETURN QUERY
   SELECT latest.tenant_id,latest.job_id,latest.task_id FROM (
    SELECT DISTINCT ON(p.tenant_id,p.job_id,p.task_id)
     p.tenant_id,p.job_id,p.task_id,p.payload
    FROM app.scheduled_readiness_plan p WHERE p.tenant_id=tenant
    ORDER BY p.tenant_id,p.job_id,p.task_id,p.fact_revision DESC
   ) latest WHERE latest.payload->>'status'='confirmed'
    AND (latest.payload->>'plannedDate')::date >=
     (CURRENT_TIMESTAMP AT TIME ZONE (latest.payload->>'timeZone'))::date
   ORDER BY latest.job_id,latest.task_id LIMIT (100-emitted);
  GET DIAGNOSTICS added = ROW_COUNT;
  emitted := emitted+added;
  EXIT WHEN emitted>=100;
 END LOOP;
 PERFORM set_config('app.tenant_id',coalesce(previous_tenant,''),true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(previous_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION infrastructure.discover_readiness_plans() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION infrastructure.discover_readiness_plans() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION infrastructure.discover_readiness_plans() TO jobguard_infrastructure;
COMMIT;
