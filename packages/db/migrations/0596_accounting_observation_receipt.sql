BEGIN;
-- Synthetic-only source receipts. No builder-facing access or new runtime authority.
CREATE TABLE app.accounting_observation_receipt (
 tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
 object_version_id text NOT NULL CHECK (length(object_version_id)>0),
 job_id uuid NOT NULL, observation_hash text NOT NULL CHECK (observation_hash ~ '^[0-9a-f]{64}$'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,evidence_id,object_version_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.accounting_observation_receipt OWNER TO jobguard_migration;
ALTER TABLE app.accounting_observation_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accounting_observation_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.accounting_observation_receipt
 FOR ALL TO jobguard_shadow,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.accounting_observation_receipt FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT SELECT,INSERT ON app.accounting_observation_receipt TO jobguard_shadow;
CREATE TRIGGER accounting_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
 ON app.accounting_observation_receipt FOR EACH STATEMENT
 EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
COMMIT;
