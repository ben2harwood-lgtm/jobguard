BEGIN;
CREATE TABLE app.evidence_pack(
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id)
);
CREATE TABLE app.evidence_pack_revision(
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, pack_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 command_id uuid NOT NULL, canonical_manifest text NOT NULL, manifest_hash char(64) NOT NULL, content_hash char(64) NOT NULL,
 sources jsonb NOT NULL CHECK(jsonb_typeof(sources)='array'), format varchar(8) NOT NULL CHECK(format IN('ZIP','PDF')),
 actor_ref varchar(200) NOT NULL, subject_hash char(64) NOT NULL, previous_hash char(64), attachment_approval_valid boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,pack_id,revision), UNIQUE(tenant_id,command_id),
 UNIQUE(tenant_id,job_id,id), FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,pack_id) REFERENCES app.evidence_pack(tenant_id,job_id,id)
);
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['evidence_pack','evidence_pack_revision'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n); EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n); EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id = current_setting(''app.tenant_id'')::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'')::uuid)',n);
 EXECUTE format('GRANT SELECT, INSERT ON app.%I TO jobguard_runtime',n); EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP;END$$;
COMMIT;
