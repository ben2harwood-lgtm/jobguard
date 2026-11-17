BEGIN;

-- Cross-tenant checkpoint metadata only; this role has no login or members.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jobguard_audit_verifier') THEN
    CREATE ROLE jobguard_audit_verifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA app TO jobguard_audit_verifier;
GRANT SELECT (tenant_id, sequence, event_hash) ON app.audit_event TO jobguard_audit_verifier;
DROP POLICY IF EXISTS audit_verifier_read ON app.audit_event;
CREATE POLICY audit_verifier_read ON app.audit_event FOR SELECT TO jobguard_audit_verifier USING (true);

-- PostgreSQL requires CREATE on the schema for an ownership transfer.
-- Remove it immediately; the verifier retains only USAGE.
GRANT USAGE, CREATE ON SCHEMA audit_control TO jobguard_audit_verifier;
CREATE OR REPLACE FUNCTION audit_control.checkpoint_candidates()
RETURNS TABLE(tenant_id uuid, sequence bigint, event_hash char(64))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (tenant_id) tenant_id, sequence, event_hash FROM app.audit_event
  ORDER BY tenant_id, sequence DESC
$$;
ALTER FUNCTION audit_control.checkpoint_candidates() OWNER TO jobguard_audit_verifier;
REVOKE CREATE ON SCHEMA audit_control FROM jobguard_audit_verifier;
REVOKE ALL ON FUNCTION audit_control.checkpoint_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_control.checkpoint_candidates() TO jobguard_migration;

DROP POLICY IF EXISTS migration_audit_integrity ON app.audit_event;
CREATE POLICY migration_audit_integrity ON app.audit_event FOR SELECT TO jobguard_migration
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

COMMIT;
