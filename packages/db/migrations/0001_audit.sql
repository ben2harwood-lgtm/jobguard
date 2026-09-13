BEGIN;

CREATE SCHEMA IF NOT EXISTS audit_control;
REVOKE ALL ON SCHEMA audit_control FROM PUBLIC, jobguard_runtime, jobguard_infrastructure;
ALTER SCHEMA audit_control OWNER TO jobguard_migration;

CREATE TABLE IF NOT EXISTS app.audit_event (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  sequence bigint NOT NULL CHECK (sequence > 0),
  version varchar(20) NOT NULL CHECK (version = 'audit.v1'),
  actor_ref varchar(200) NOT NULL,
  event_type varchar(100) NOT NULL,
  subject_type varchar(100) NOT NULL,
  subject_ref varchar(200) NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash char(64) NOT NULL,
  previous_hash char(64),
  event_hash char(64) NOT NULL,
  PRIMARY KEY (tenant_id, sequence),
  CONSTRAINT audit_event_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT audit_event_payload_keys_ck CHECK (payload - ARRAY['references','hashes','classifications'] = '{}'::jsonb)
);
CREATE TABLE IF NOT EXISTS audit_control.audit_head (
  tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
  sequence bigint NOT NULL DEFAULT 0,
  event_hash char(64)
);
CREATE INDEX IF NOT EXISTS audit_event_tenant_created_idx ON app.audit_event (tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS audit_control.checkpoint (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  sequence bigint NOT NULL,
  event_hash char(64) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, sequence)
);

CREATE OR REPLACE FUNCTION app.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit records are immutable' USING ERRCODE = '55000'; END $$;
DROP TRIGGER IF EXISTS audit_event_immutable ON app.audit_event;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON app.audit_event
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
DROP TRIGGER IF EXISTS audit_checkpoint_immutable ON audit_control.checkpoint;
CREATE TRIGGER audit_checkpoint_immutable BEFORE UPDATE OR DELETE ON audit_control.checkpoint
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

ALTER TABLE app.audit_event OWNER TO jobguard_migration;
ALTER TABLE audit_control.audit_head OWNER TO jobguard_migration;
ALTER TABLE audit_control.checkpoint OWNER TO jobguard_migration;
ALTER TABLE app.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app.audit_event;
CREATE POLICY tenant_isolation ON app.audit_event FOR ALL TO jobguard_runtime
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS migration_audit_integrity ON app.audit_event;
CREATE POLICY migration_audit_integrity ON app.audit_event FOR SELECT TO jobguard_migration USING (true);

CREATE OR REPLACE FUNCTION app.lock_audit_head()
RETURNS TABLE(sequence bigint, event_hash char(64)) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit_control AS $$
DECLARE active_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
BEGIN
  IF active_tenant IS NULL THEN RAISE EXCEPTION 'missing tenant context'; END IF;
  INSERT INTO audit_control.audit_head (tenant_id) VALUES (active_tenant) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT h.sequence, h.event_hash FROM audit_control.audit_head h
    WHERE h.tenant_id = active_tenant FOR UPDATE;
END $$;
CREATE OR REPLACE FUNCTION app.advance_audit_head(new_sequence bigint, new_hash char(64))
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, audit_control, app AS $$
DECLARE active_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.audit_event first_event JOIN audit_control.audit_head h
    ON h.tenant_id = first_event.tenant_id WHERE first_event.tenant_id = active_tenant
    AND first_event.sequence = h.sequence + 1
    AND first_event.previous_hash IS NOT DISTINCT FROM h.event_hash)
    OR NOT EXISTS (SELECT 1 FROM app.audit_event final_event WHERE final_event.tenant_id = active_tenant
      AND final_event.sequence = new_sequence AND final_event.event_hash = new_hash) THEN
    RAISE EXCEPTION 'head must reference the appended event';
  END IF;
  UPDATE audit_control.audit_head SET sequence = new_sequence, event_hash = new_hash
    WHERE tenant_id = active_tenant;
END $$;
ALTER FUNCTION app.lock_audit_head() OWNER TO jobguard_migration;
ALTER FUNCTION app.advance_audit_head(bigint, char(64)) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_audit_head(), app.advance_audit_head(bigint, char(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_audit_head(), app.advance_audit_head(bigint, char(64)) TO jobguard_runtime;

GRANT SELECT, INSERT ON app.audit_event TO jobguard_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.audit_event FROM jobguard_runtime;
REVOKE ALL ON audit_control.checkpoint FROM PUBLIC, jobguard_runtime, jobguard_infrastructure;

COMMIT;
