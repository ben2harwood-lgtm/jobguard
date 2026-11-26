-- Q56 / V2-G2. Handover pack versions: the builder chooses what goes in, previews it, and saves
-- numbered versions. Each version is a frozen snapshot of the exact text and references the
-- customer will see, with the source versions it was built from. No amounts. Release is G3.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_handover_version (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    version integer NOT NULL CHECK (version >= 1),
    command_id uuid NOT NULL,
    content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND content->>'schema' = 'handover-content.v1'),
    sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'object'),
    content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, version),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id),
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES app.membership (tenant_id, id)
  );
  ALTER TABLE app.v2_handover_version ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_handover_version FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_handover_version_runtime ON app.v2_handover_version;
  CREATE POLICY v2_handover_version_runtime ON app.v2_handover_version TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_version.tenant_id, v2_handover_version.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_version.tenant_id, v2_handover_version.job_id)));
  REVOKE ALL ON app.v2_handover_version FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_handover_version TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_handover_version_immutable ON app.v2_handover_version;
  CREATE TRIGGER v2_handover_version_immutable BEFORE UPDATE OR DELETE ON app.v2_handover_version
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
END
$v2$;

COMMIT;
