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
-- Only the existing migration/assurance role registers synthetic keys. Conflict
-- handling also covers invisible foreign-tenant fingerprints and concurrent reuse.
CREATE FUNCTION app.register_tenant_key(integer,uuid,text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid;
BEGIN
 tenant := nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF current_database()<>'jobguard_synthetic_demo' OR tenant IS NULL
    OR $1 IS NULL OR $1 NOT BETWEEN 1 AND 1000000 OR $2 IS NULL
    OR $3 IS NULL OR $3 !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'TENANT_KEY_REGISTRY_REFUSED';
 END IF;
 INSERT INTO app.tenant_key_version(tenant_id,version,command_id,fingerprint)
 VALUES(tenant,$1,$2,$3) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_KEY_REGISTRY_REFUSED'; END IF;
EXCEPTION WHEN OTHERS THEN
 RAISE EXCEPTION 'TENANT_KEY_REGISTRY_REFUSED';
END $$;
ALTER FUNCTION app.register_tenant_key(integer,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.register_tenant_key(integer,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.register_tenant_key(integer,uuid,text) TO jobguard_migration;
COMMIT;
