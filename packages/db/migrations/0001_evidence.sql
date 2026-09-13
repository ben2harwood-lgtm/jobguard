BEGIN;

CREATE TABLE IF NOT EXISTS app.evidence_upload (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  id uuid NOT NULL,
  job_id uuid NOT NULL,
  scope_id uuid,
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  evidence_type varchar(40) NOT NULL CHECK (evidence_type IN ('site_photo', 'document')),
  content_type varchar(100) NOT NULL,
  retention_class varchar(40) NOT NULL CHECK (retention_class IN ('temporary_upload', 'pilot_evidence')),
  state varchar(30) NOT NULL CHECK (state IN ('pending', 'quarantined', 'verified', 'rejected')),
  object_key varchar(500) NOT NULL,
  object_version_id varchar(200),
  expected_sha256 char(64) NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  expected_bytes integer NOT NULL CHECK (expected_bytes BETWEEN 1 AND 20971520),
  capture_time timestamptz,
  received_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, object_key, object_version_id),
  CHECK ((state = 'pending' AND object_version_id IS NULL) OR state <> 'pending')
);

CREATE TABLE IF NOT EXISTS app.evidence_item (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  id uuid NOT NULL,
  upload_id uuid NOT NULL,
  job_id uuid NOT NULL,
  scope_id uuid,
  evidence_type varchar(40) NOT NULL CHECK (evidence_type IN ('site_photo', 'document')),
  artifact_role varchar(20) NOT NULL CHECK (artifact_role IN ('original', 'preview')),
  original_evidence_id uuid,
  retention_class varchar(40) NOT NULL CHECK (retention_class IN ('temporary_upload', 'pilot_evidence', 'derived_preview')),
  state varchar(20) NOT NULL CHECK (state IN ('verified', 'rejected')),
  object_key varchar(500) NOT NULL,
  object_version_id varchar(200) NOT NULL,
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 20971520),
  content_type varchar(100) NOT NULL,
  capture_time timestamptz,
  received_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, upload_id),
  UNIQUE (tenant_id, object_key, object_version_id),
  FOREIGN KEY (tenant_id, upload_id) REFERENCES app.evidence_upload(tenant_id, id),
  FOREIGN KEY (tenant_id, original_evidence_id) REFERENCES app.evidence_item(tenant_id, id),
  CHECK ((artifact_role = 'original' AND original_evidence_id IS NULL) OR
         (artifact_role = 'preview' AND original_evidence_id IS NOT NULL AND retention_class = 'derived_preview'))
);

CREATE TABLE IF NOT EXISTS app.evidence_deletion_request (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'policy_review_required'
    CHECK (status = 'policy_review_required'),
  requested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, evidence_id) REFERENCES app.evidence_item(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS app.evidence_export_request (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  id uuid NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id)
);

ALTER TABLE app.evidence_upload OWNER TO jobguard_migration;
ALTER TABLE app.evidence_item OWNER TO jobguard_migration;
ALTER TABLE app.evidence_deletion_request OWNER TO jobguard_migration;
ALTER TABLE app.evidence_export_request OWNER TO jobguard_migration;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['evidence_upload', 'evidence_item', 'evidence_deletion_request', 'evidence_export_request'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON app.%I', table_name);
    EXECUTE format($policy$CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime
      USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$policy$, table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.evidence_upload, app.evidence_deletion_request, app.evidence_export_request TO jobguard_runtime;
GRANT SELECT, INSERT ON app.evidence_item TO jobguard_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.evidence_item FROM jobguard_runtime;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON app.evidence_upload, app.evidence_deletion_request, app.evidence_export_request FROM jobguard_runtime;

COMMIT;
