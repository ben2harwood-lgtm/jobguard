BEGIN;
-- Preserve append-only scheduled facts and proposals. No rows, columns or grants change.
DROP POLICY tenant_isolation ON app.scheduled_readiness_plan;
CREATE POLICY tenant_isolation ON app.scheduled_readiness_plan
 TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
DROP POLICY tenant_isolation ON app.scheduled_readiness_proposal;
CREATE POLICY tenant_isolation ON app.scheduled_readiness_proposal
 TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.scheduled_readiness_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'SCHEDULED_READINESS_IMMUTABLE' USING ERRCODE='55000';
END $$;
ALTER FUNCTION app.scheduled_readiness_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.scheduled_readiness_immutable()
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.scheduled_readiness_plan
 FOR EACH ROW EXECUTE FUNCTION app.scheduled_readiness_immutable();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.scheduled_readiness_plan
 FOR EACH STATEMENT EXECUTE FUNCTION app.scheduled_readiness_immutable();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.scheduled_readiness_proposal
 FOR EACH ROW EXECUTE FUNCTION app.scheduled_readiness_immutable();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.scheduled_readiness_proposal
 FOR EACH STATEMENT EXECUTE FUNCTION app.scheduled_readiness_immutable();
COMMIT;
