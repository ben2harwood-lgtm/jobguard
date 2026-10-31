BEGIN;
-- A refused command is already stored and audited atomically by the executor.
-- Project one operator alert per command instead of maintaining another table.
CREATE FUNCTION app.worm_operator_alerts()
RETURNS TABLE(command_id uuid,evidence_id uuid,action text,code text,severity text,occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT c.id,c.evidence_id,c.action,'WORM_STORAGE_REFUSED'::text,'critical'::text,a.created_at
 FROM app.worm_command c
 JOIN app.worm_attempt a ON (a.tenant_id,a.command_id,a.attempt)=(c.tenant_id,c.id,c.attempts)
 WHERE c.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND c.status='refused' AND a.outcome='refused' AND c.action IN ('apply_hold','release_hold')
 ORDER BY a.created_at,c.id
$$;
ALTER FUNCTION app.worm_operator_alerts() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.worm_operator_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.worm_operator_alerts() TO jobguard_worm_operator;
-- Forward fix only. No existing routine, receipt, evidence or protection changes.
COMMIT;
