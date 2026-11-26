-- Q54 / V2-DV1. The builder marks a diary note "Customer can see this". The mark is a
-- record beside main's diary, which is unchanged. Only marked notes the builder then
-- reviews can reach a Friday update.
BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_practice_firm'
  ) OR to_regclass('app.job_diary_entry') IS NULL THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_diary_share (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    diary_entry_id uuid NOT NULL,
    sequence integer NOT NULL CHECK (sequence >= 1),
    shared boolean NOT NULL,
    command_id uuid NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, diary_entry_id, sequence),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, diary_entry_id) REFERENCES app.job_diary_entry (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES app.membership (tenant_id, id)
  );
  ALTER TABLE app.v2_diary_share ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_diary_share FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_diary_share_runtime ON app.v2_diary_share;
  CREATE POLICY v2_diary_share_runtime ON app.v2_diary_share TO jobguard_runtime
    USING (tenant_id=(SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_diary_share.tenant_id,v2_diary_share.job_id)))
    WITH CHECK (tenant_id=(SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_diary_share.tenant_id,v2_diary_share.job_id)));
  REVOKE ALL ON app.v2_diary_share FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_diary_share TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_diary_share_immutable ON app.v2_diary_share;
  CREATE TRIGGER v2_diary_share_immutable BEFORE UPDATE OR DELETE ON app.v2_diary_share
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
END
$v2$;
COMMIT;
