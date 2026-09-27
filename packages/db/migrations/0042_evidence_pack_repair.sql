BEGIN;
-- Upgrade existing 0041 policies before FK validation under the real migration
-- role. Missing/empty context sees no tenant rows; FORCE RLS and grants stay intact.
ALTER POLICY tenant_isolation ON app.evidence_pack
 USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation ON app.evidence_pack_revision
 USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- Expand-compatible with 0041. Old deployments can still insert ZIP/PDF labels;
-- repaired readers always describe the actual text representation honestly.
ALTER TABLE app.evidence_pack_revision DROP CONSTRAINT evidence_pack_revision_format_check;
ALTER TABLE app.evidence_pack_revision ADD CONSTRAINT evidence_pack_revision_format_check CHECK (format IN ('ZIP','PDF','TEXT'));
ALTER TABLE app.evidence_pack_revision ADD COLUMN artifact_text text,
 ADD COLUMN request_hash char(64) CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 ADD COLUMN source_omissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_omissions)='array');
ALTER TABLE app.evidence_pack ADD CONSTRAINT evidence_pack_exact_case_key UNIQUE(tenant_id,job_id,case_id,id);
ALTER TABLE app.evidence_pack_revision ADD CONSTRAINT evidence_pack_revision_exact_case_fk
 FOREIGN KEY(tenant_id,job_id,case_id,pack_id) REFERENCES app.evidence_pack(tenant_id,job_id,case_id,id);
ALTER TABLE app.evidence_pack_revision ADD CONSTRAINT evidence_pack_revision_exact_hash_key UNIQUE(tenant_id,job_id,case_id,pack_id,manifest_hash,content_hash);
CREATE TABLE app.evidence_pack_attachment_approval (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, pack_id uuid NOT NULL,
 command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 manifest_hash char(64) NOT NULL CHECK(manifest_hash ~ '^[0-9a-f]{64}$'),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 actor_ref varchar(200) NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id,pack_id) REFERENCES app.evidence_pack(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,pack_id,manifest_hash,content_hash) REFERENCES app.evidence_pack_revision(tenant_id,job_id,case_id,pack_id,manifest_hash,content_hash)
);
ALTER TABLE app.evidence_pack_attachment_approval OWNER TO jobguard_migration;
ALTER TABLE app.evidence_pack_attachment_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_pack_attachment_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.evidence_pack_attachment_approval FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.evidence_pack_attachment_approval TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.evidence_pack_attachment_approval FROM jobguard_runtime;
-- No SECURITY DEFINER writes. Commands append approvals; readers compare exact
-- approved hashes with the current source manifest. The 0041 boolean is obsolete
-- but retained for expand compatibility, and is never authorization.
COMMENT ON COLUMN app.evidence_pack_revision.attachment_approval_valid IS 'Legacy unused flag. Authority is the immutable attachment approval command plus current source hashes.';
COMMIT;
