BEGIN;
-- CH5-P STOP: MON1-A's only accepted seam is an unconditional held boundary.
-- This private signature does not implement adoption. In particular, it does not
-- relax the v1 baseline constraint, mint ownership, or create a counting event.
-- No runtime grant until a separately reviewed complete atomic writer exists.
CREATE FUNCTION app.adopt_in_flight_job_v3(t uuid,source_job_id uuid,session_digest text,command_id uuid,authorization_id uuid,snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'METER_PLACE_SOURCE_HANDOFF_HELD' USING ERRCODE='55000';
END $$;
ALTER FUNCTION app.adopt_in_flight_job_v3(uuid,uuid,text,uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.adopt_in_flight_job_v3(uuid,uuid,text,uuid,uuid,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_meter,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
