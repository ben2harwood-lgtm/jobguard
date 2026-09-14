BEGIN;

CREATE TABLE app.capture_source (
  id uuid NOT NULL, tenant_id uuid NOT NULL, source_version integer NOT NULL DEFAULT 1 CHECK (source_version = 1),
  kind varchar(12) NOT NULL CHECK (kind IN ('text','audio')), content_bytes bytea NOT NULL,
  content_text text NOT NULL, sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,source_version)
);
CREATE TABLE app.job_record_proposal (
  id uuid NOT NULL, tenant_id uuid NOT NULL, capture_id uuid NOT NULL, job_id uuid NOT NULL,
  source_id uuid NOT NULL, source_version integer NOT NULL, source_sha256 char(64) NOT NULL,
  prompt_version varchar(80) NOT NULL, schema_version varchar(80) NOT NULL, model varchar(80) NOT NULL,
  proposal jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,capture_id), UNIQUE (tenant_id,job_id,id),
  FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id),
  FOREIGN KEY (tenant_id,source_id,source_version) REFERENCES app.capture_source(tenant_id,id,source_version)
);
ALTER TABLE app.proposal_line ADD COLUMN proposal_id uuid;
ALTER TABLE app.proposal_line ADD COLUMN ordinal integer CHECK (ordinal > 0);
ALTER TABLE app.proposal_line ADD COLUMN proposed_data jsonb;
ALTER TABLE app.proposal_line ADD CONSTRAINT proposal_line_record_fk
  FOREIGN KEY (tenant_id,job_id,proposal_id) REFERENCES app.job_record_proposal(tenant_id,job_id,id);
CREATE UNIQUE INDEX proposal_line_record_ordinal_uq ON app.proposal_line(tenant_id,proposal_id,ordinal);

CREATE FUNCTION app.reject_capture_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'capture sources and proposals are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER capture_source_immutable BEFORE UPDATE OR DELETE ON app.capture_source FOR EACH ROW EXECUTE FUNCTION app.reject_capture_mutation();
CREATE TRIGGER job_record_proposal_immutable BEFORE UPDATE OR DELETE ON app.job_record_proposal FOR EACH ROW EXECUTE FUNCTION app.reject_capture_mutation();

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['capture_source','job_record_proposal'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n); EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT, INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
ALTER FUNCTION app.reject_capture_mutation() OWNER TO jobguard_migration;
COMMIT;
