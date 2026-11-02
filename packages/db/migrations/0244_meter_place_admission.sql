BEGIN;
-- Role dependency follows repaired 0209: guarded creation/posture validation of
-- jobguard_meter there, pre-created and posture-checked by demo-bootstrap before
-- SET ROLE jobguard_migration. No new role or ownership transfer in this step.
-- Private fail-closed boundary only. MON1-S deliberately exposes held candidate
-- commitments. No source enum/resolver or authenticated pre-mutation handoff is
-- accepted yet. Never turn supplied counts or an invented future row into authority.
CREATE FUNCTION app.mon1_admit_place(t uuid,j uuid,source_kind text,source_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'jobguard_migration' OR t IS NULL OR
    t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'METER_PLACE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Caller must acquire this BEFORE receipt/job/source locks. This boundary
 -- never introduces a tenant lock after a business/audit lock.
 IF NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'
  AND mode='ExclusiveLock' AND granted AND objsubid=1
  AND classid::bigint=(hashtextextended(t::text,184)>>32)::bit(32)::bigint
  AND objid::bigint=hashtextextended(t::text,184)::bit(32)::bigint)
 THEN RAISE EXCEPTION 'METER_PLACE_LOCK_ORDER_REQUIRED' USING ERRCODE='55000'; END IF;
 -- Deliberately unconditional, including replay and automatic-looking sources.
 -- Requires a later issued source/authority integration, never a caller toggle.
 RAISE EXCEPTION 'METER_PLACE_SOURCE_HANDOFF_HELD' USING ERRCODE='55000';
END $$;
ALTER FUNCTION app.mon1_admit_place(uuid,uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_admit_place(uuid,uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_meter,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
