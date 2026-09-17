BEGIN;
CREATE TABLE app.synthetic_evidence_original (
  tenant_id uuid NOT NULL, upload_id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL,
  object_key varchar(1024) NOT NULL, object_version_id varchar(1024) NOT NULL,
  environment varchar(24) NOT NULL CHECK (environment = 'synthetic_demo'),
  content_type varchar(100) NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) > 0 AND octet_length(bytes) <= 25000000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (tenant_id,upload_id),
  UNIQUE (tenant_id,object_key,object_version_id),
  FOREIGN KEY (tenant_id,upload_id) REFERENCES app.evidence_upload(tenant_id,id),
  FOREIGN KEY (tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id)
);
ALTER TABLE app.synthetic_evidence_original OWNER TO jobguard_migration;
ALTER TABLE app.synthetic_evidence_original ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.synthetic_evidence_original FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.synthetic_evidence_original FOR ALL TO jobguard_runtime
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.synthetic_evidence_original TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.synthetic_evidence_original FROM jobguard_runtime;
COMMIT;
