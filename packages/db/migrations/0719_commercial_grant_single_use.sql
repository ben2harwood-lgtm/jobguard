BEGIN;
-- LATER-SAFETY-93: preserve immutable authorization row shape; consume each grant once.
CREATE TABLE app.commercial_grant_use (
 tenant_id uuid NOT NULL, authorization_id uuid NOT NULL,
 used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,authorization_id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
ALTER TABLE app.commercial_grant_use OWNER TO jobguard_migration;
ALTER TABLE app.commercial_grant_use ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.commercial_grant_use FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.commercial_grant_use FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.commercial_grant_use FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT SELECT,INSERT ON app.commercial_grant_use TO jobguard_runtime;
CREATE TRIGGER commercial_grant_use_immutable BEFORE UPDATE OR DELETE ON app.commercial_grant_use
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
-- Forward fix only: retain use records on rollback so consumed grants cannot be replayed.
COMMIT;
