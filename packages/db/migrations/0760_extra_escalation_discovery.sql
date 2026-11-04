BEGIN;
-- Identifier-only worker discovery. FORCE RLS remains active: inspect one tenant at a time,
-- just as identity bootstrap does. Function-local GUC restores the caller's context on exit.
CREATE FUNCTION infrastructure.discover_extra_escalations() RETURNS TABLE(tenant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET app.tenant_id='' AS $$
DECLARE t uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 FOR t IN SELECT id FROM control_plane.tenant ORDER BY id LOOP
  PERFORM set_config('app.tenant_id',t::text,true);
  IF EXISTS(
   SELECT 1 FROM app.extra_approval_request r
   CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n,max(f.server_recorded_at) AS started
    FROM app.extra_approval_step_fact f WHERE (f.tenant_id,f.request_id)=(r.tenant_id,r.id)
   ) progress
   CROSS JOIN LATERAL (SELECT r.requirement->'steps'->progress.n AS step) current_step
   WHERE r.tenant_id=t AND r.net_pence IS NOT NULL
    AND r.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x
     WHERE (x.tenant_id,x.variation_id)=(r.tenant_id,r.variation_id))
    AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE (o.tenant_id,o.request_id)=(r.tenant_id,r.id))
    AND current_step.step->>'kind'='human' AND current_step.step->>'role'<>'client_approver'
    AND clock_timestamp()>=coalesce(progress.started,r.server_recorded_at)
     +((current_step.step->>'timeLimitMinutes')::numeric*interval '1 minute')
    AND NOT EXISTS(SELECT 1 FROM app.extra_escalation_fact e
     WHERE (e.tenant_id,e.request_id,e.step_index)=(r.tenant_id,r.id,progress.n))
  ) THEN tenant_id:=t; RETURN NEXT; END IF;
 END LOOP;
END $$;
ALTER FUNCTION infrastructure.discover_extra_escalations() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION infrastructure.discover_extra_escalations() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION infrastructure.discover_extra_escalations() TO jobguard_infrastructure;
COMMIT;
