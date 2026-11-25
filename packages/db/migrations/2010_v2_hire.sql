BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_hire_revision (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    hire_id uuid NOT NULL,
    item_version integer NOT NULL CHECK (item_version > 0),
    command_id uuid NOT NULL,
    request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
    state jsonb NOT NULL CHECK (jsonb_typeof(state)='object'
      AND state->>'status' IN ('on_hire','off_hire_requested','off_hire')
      AND state->>'kind' IN ('scaffold','skip','plant','other')
      AND state->>'weeklyCost' ~ '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$'
      AND jsonb_typeof(state->'tasks')='array'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,job_id,hire_id,item_version),
    UNIQUE (tenant_id,job_id,command_id),
    FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id)
  );
  ALTER TABLE app.v2_hire_revision ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_hire_revision FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_hire_runtime ON app.v2_hire_revision;
  CREATE POLICY v2_hire_runtime ON app.v2_hire_revision TO jobguard_runtime
    USING (tenant_id=(SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_hire_revision.tenant_id,v2_hire_revision.job_id)
    ));
  REVOKE ALL ON app.v2_hire_revision FROM PUBLIC;
  GRANT SELECT,INSERT ON app.v2_hire_revision TO jobguard_runtime;
END
$v2$;
COMMIT;
