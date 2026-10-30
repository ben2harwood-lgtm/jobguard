BEGIN;
-- Dark metadata registry. No secret material, provider routes or runtime grants.
CREATE TABLE app.tenant_key_version (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 1000000),
 command_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,version), UNIQUE(tenant_id,command_id), UNIQUE(fingerprint)
);
CREATE TABLE app.tenant_key_revocation (
 tenant_id uuid NOT NULL, version integer NOT NULL, command_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,version), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,version) REFERENCES app.tenant_key_version(tenant_id,version)
);
CREATE FUNCTION app.tenant_key_registry_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'TENANT_KEY_REGISTRY_IMMUTABLE'; END $$;
ALTER FUNCTION app.tenant_key_registry_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.tenant_key_registry_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['tenant_key_version','tenant_key_revocation'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_scope ON app.%I TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.tenant_key_registry_immutable()',n);
  EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.tenant_key_registry_immutable()',n);
 END LOOP;
END $$;
COMMIT;
