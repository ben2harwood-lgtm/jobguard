BEGIN;
-- DARK: synthetic test bytes only; no provider or live transport is installed.
CREATE TABLE app.synthetic_evidence_chunk (
  tenant_id uuid NOT NULL,
  upload_id uuid NOT NULL,
  byte_offset integer NOT NULL CHECK (byte_offset BETWEEN 0 AND 25000000),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, upload_id, byte_offset),
  FOREIGN KEY (tenant_id, upload_id) REFERENCES app.evidence_upload(tenant_id, id)
);
ALTER TABLE app.synthetic_evidence_chunk OWNER TO jobguard_migration;
ALTER TABLE app.synthetic_evidence_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.synthetic_evidence_chunk FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.synthetic_evidence_chunk FOR ALL TO jobguard_runtime
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND EXISTS (
    SELECT 1 FROM app.evidence_upload u JOIN app.job_commercial_track t
      ON (t.tenant_id,t.job_id)=(u.tenant_id,u.job_id)
    WHERE u.tenant_id=synthetic_evidence_chunk.tenant_id AND u.id=synthetic_evidence_chunk.upload_id
      AND t.environment='synthetic_demo' AND u.state='pending' AND u.expires_at>clock_timestamp()
  ));
GRANT SELECT, INSERT ON app.synthetic_evidence_chunk TO jobguard_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.synthetic_evidence_chunk FROM jobguard_runtime;
CREATE TRIGGER synthetic_evidence_chunk_immutable BEFORE UPDATE OR DELETE ON app.synthetic_evidence_chunk
  FOR EACH ROW EXECUTE FUNCTION app.reject_evidence_object_mutation();
COMMIT;
