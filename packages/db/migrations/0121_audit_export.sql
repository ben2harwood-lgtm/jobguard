BEGIN;

-- An assurance credential copies ONLY already recorded trusted checkpoints here.
-- Runtime never reads audit_control and has no INSERT privilege on this handoff.
CREATE TABLE app.audit_export_checkpoint (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  sequence bigint NOT NULL CHECK(sequence > 0),
  event_hash char(64) NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,sequence),
  FOREIGN KEY(tenant_id,sequence) REFERENCES audit_control.checkpoint(tenant_id,sequence),
  FOREIGN KEY(tenant_id,sequence) REFERENCES app.audit_event(tenant_id,sequence)
);
CREATE TABLE app.audit_export (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  entry_count integer NOT NULL CHECK(entry_count > 0),
  head_hash char(64) NOT NULL CHECK(head_hash ~ '^[a-f0-9]{64}$'),
  file jsonb NOT NULL CHECK(jsonb_typeof(file)='object' AND file ? 'version' AND file->>'version'='audit-export-file.v1'),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
  FOREIGN KEY(tenant_id,id) REFERENCES app.audit_event(tenant_id,id)
);
CREATE TRIGGER audit_export_immutable BEFORE UPDATE OR DELETE ON app.audit_export
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER audit_export_checkpoint_immutable BEFORE UPDATE OR DELETE ON app.audit_export_checkpoint
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
ALTER TABLE app.audit_export OWNER TO jobguard_migration;
ALTER TABLE app.audit_export_checkpoint OWNER TO jobguard_migration;
ALTER TABLE app.audit_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_export FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_export_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_export_checkpoint FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.audit_export FOR ALL TO jobguard_runtime
  USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation ON app.audit_export_checkpoint FOR ALL TO jobguard_runtime
  USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY migration_integrity ON app.audit_export FOR ALL TO jobguard_migration USING(true) WITH CHECK(true);
CREATE POLICY migration_integrity ON app.audit_export_checkpoint FOR ALL TO jobguard_migration USING(true) WITH CHECK(true);
REVOKE ALL ON app.audit_export,app.audit_export_checkpoint FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT SELECT,INSERT ON app.audit_export TO jobguard_runtime;
GRANT SELECT ON app.audit_export_checkpoint TO jobguard_runtime;
-- No changes to existing roles, grants, policies, tables, routines or audit rows.
COMMIT;
