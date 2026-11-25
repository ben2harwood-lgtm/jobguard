BEGIN;

DO $v2$
BEGIN
  -- The shared runner discovers this file. Only the checked V2 bootstrap,
  -- after 2001 has installed the firm boundary, provisions these records.
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_work_plan (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    quote_revision_id uuid NOT NULL,
    template_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (tenant_id, job_id, quote_revision_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id)
      REFERENCES app.quote_revision (tenant_id, job_id, id)
  );

  CREATE TABLE IF NOT EXISTS app.v2_work_plan_task (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    quote_revision_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    template_task_key text NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key),
    UNIQUE (tenant_id, job_id, quote_revision_id, position),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id)
      REFERENCES app.v2_work_plan (tenant_id, job_id, quote_revision_id),
    FOREIGN KEY (tenant_id, quote_revision_id, scope_item_id)
      REFERENCES app.quote_line (tenant_id, quote_revision_id, scope_item_id)
  );

  ALTER TABLE app.v2_work_plan ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_work_plan FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_work_plan_task ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_work_plan_task FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS v2_work_plan_runtime ON app.v2_work_plan;
  CREATE POLICY v2_work_plan_runtime ON app.v2_work_plan TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_work_plan.tenant_id, v2_work_plan.job_id)
    ));

  DROP POLICY IF EXISTS v2_work_plan_task_runtime ON app.v2_work_plan_task;
  CREATE POLICY v2_work_plan_task_runtime ON app.v2_work_plan_task TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_work_plan_task.tenant_id, v2_work_plan_task.job_id)
    ));

  REVOKE ALL ON app.v2_work_plan, app.v2_work_plan_task FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_work_plan, app.v2_work_plan_task TO jobguard_runtime;
END
$v2$;
COMMIT;
