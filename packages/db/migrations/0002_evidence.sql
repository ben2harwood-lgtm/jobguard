BEGIN;

CREATE TABLE IF NOT EXISTS app.evidence_upload (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  job_id uuid NOT NULL,
  scope_item_id uuid,
  object_key varchar(1024) NOT NULL,
  expected_sha256 char(64) NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  expected_content_type varchar(100) NOT NULL,
  maximum_bytes bigint NOT NULL CHECK (maximum_bytes > 0),
  retention_class varchar(40) NOT NULL CHECK (retention_class IN ('transient_upload','standard_evidence','legal_hold')),
  state varchar(20) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','quarantined','verified','rejected')),
  rejection_code varchar(50),
  object_version_id varchar(1024),
  device_captured_at timestamptz,
  server_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  server_verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT evidence_upload_tenant_key_uq UNIQUE (tenant_id, object_key),
  CONSTRAINT evidence_upload_state_ck CHECK (
    (state IN ('pending','quarantined') AND server_verified_at IS NULL)
    OR (state = 'verified' AND server_verified_at IS NOT NULL AND object_version_id IS NOT NULL AND rejection_code IS NULL)
    OR (state = 'rejected' AND rejection_code IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS evidence_upload_cleanup_idx ON app.evidence_upload (state, expires_at)
  WHERE state IN ('pending','quarantined');

CREATE TABLE IF NOT EXISTS app.evidence_object (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  upload_id uuid,
  job_id uuid NOT NULL,
  scope_item_id uuid,
  kind varchar(20) NOT NULL CHECK (kind IN ('original','preview')),
  original_evidence_id uuid,
  evidence_type varchar(40) NOT NULL,
  object_key varchar(1024) NOT NULL,
  object_version_id varchar(1024) NOT NULL CHECK (length(object_version_id) > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  content_type varchar(100) NOT NULL,
  retention_class varchar(40) NOT NULL CHECK (retention_class IN ('standard_evidence','legal_hold')),
  device_captured_at timestamptz,
  server_received_at timestamptz NOT NULL,
  server_verified_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT evidence_object_upload_uq UNIQUE (tenant_id, upload_id),
  CONSTRAINT evidence_object_version_uq UNIQUE (tenant_id, object_key, object_version_id),
  CONSTRAINT evidence_object_upload_fk FOREIGN KEY (tenant_id, upload_id)
    REFERENCES app.evidence_upload(tenant_id, id),
  CONSTRAINT evidence_object_original_fk FOREIGN KEY (tenant_id, original_evidence_id)
    REFERENCES app.evidence_object(tenant_id, id),
  CONSTRAINT evidence_object_kind_ck CHECK (
    (kind = 'original' AND original_evidence_id IS NULL AND upload_id IS NOT NULL)
    OR (kind = 'preview' AND original_evidence_id IS NOT NULL AND original_evidence_id <> id AND upload_id IS NULL)
  ),
  CONSTRAINT evidence_object_link_identity_uq UNIQUE (tenant_id, id, job_id, scope_item_id)
);

CREATE TABLE IF NOT EXISTS app.evidence_link (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  job_id uuid NOT NULL,
  scope_item_id uuid,
  required_evidence_type varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT evidence_link_target_fk FOREIGN KEY (tenant_id, evidence_id, job_id, scope_item_id)
    REFERENCES app.evidence_object(tenant_id, id, job_id, scope_item_id),
  CONSTRAINT evidence_link_once_uq UNIQUE (tenant_id, evidence_id, job_id, scope_item_id)
);

CREATE OR REPLACE FUNCTION app.reject_evidence_object_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'registered evidence is immutable' USING ERRCODE = '55000'; END $$;
DROP TRIGGER IF EXISTS evidence_object_immutable ON app.evidence_object;
CREATE TRIGGER evidence_object_immutable BEFORE UPDATE OR DELETE ON app.evidence_object
FOR EACH ROW EXECUTE FUNCTION app.reject_evidence_object_mutation();

ALTER TABLE app.evidence_upload OWNER TO jobguard_migration;
ALTER TABLE app.evidence_object OWNER TO jobguard_migration;
ALTER TABLE app.evidence_link OWNER TO jobguard_migration;
ALTER FUNCTION app.reject_evidence_object_mutation() OWNER TO jobguard_migration;

ALTER TABLE app.evidence_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_upload FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_object FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_link FORCE ROW LEVEL SECURITY;
DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['evidence_upload','evidence_object','evidence_link'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON app.%I', table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
END LOOP; END $$;

GRANT SELECT, INSERT, UPDATE ON app.evidence_upload TO jobguard_runtime;
GRANT SELECT, INSERT ON app.evidence_object, app.evidence_link TO jobguard_runtime;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.evidence_upload, app.evidence_object, app.evidence_link FROM jobguard_runtime;
REVOKE UPDATE ON app.evidence_object, app.evidence_link FROM jobguard_runtime;

COMMIT;
