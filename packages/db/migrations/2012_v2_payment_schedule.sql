BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  -- Working plan only: this table cannot authorize, issue or send an invoice or move money.
  CREATE TABLE IF NOT EXISTS app.v2_payment_schedule (
    tenant_id uuid NOT NULL, job_id uuid NOT NULL, quote_revision_id uuid NOT NULL,
    command_id uuid NOT NULL, expected_version integer NOT NULL CHECK (expected_version = 0),
    stages jsonb NOT NULL CHECK (jsonb_typeof(stages) = 'array' AND jsonb_array_length(stages) BETWEEN 1 AND 20),
    actor_membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, quote_revision_id), UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id) REFERENCES app.quote_revision(tenant_id, job_id, id)
  );
  CREATE TABLE IF NOT EXISTS app.v2_payment_schedule_task_done (
    tenant_id uuid NOT NULL, job_id uuid NOT NULL, quote_revision_id uuid NOT NULL,
    command_id uuid NOT NULL, expected_version integer NOT NULL CHECK (expected_version > 0),
    scope_item_id uuid NOT NULL, template_task_key text NOT NULL, actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, command_id),
    UNIQUE (tenant_id, job_id, quote_revision_id, expected_version),
    UNIQUE (tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id)
      REFERENCES app.v2_payment_schedule(tenant_id, job_id, quote_revision_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key)
      REFERENCES app.v2_work_plan_task(tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key)
  );
  ALTER TABLE app.v2_payment_schedule_task_done ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_payment_schedule_task_done FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_payment_schedule_task_done_runtime ON app.v2_payment_schedule_task_done;
  CREATE POLICY v2_payment_schedule_task_done_runtime ON app.v2_payment_schedule_task_done TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_payment_schedule_task_done.tenant_id, v2_payment_schedule_task_done.job_id)
    ));
  REVOKE ALL ON app.v2_payment_schedule_task_done FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_payment_schedule_task_done TO jobguard_runtime;
  ALTER TABLE app.v2_payment_schedule ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_payment_schedule FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_payment_schedule_runtime ON app.v2_payment_schedule;
  CREATE POLICY v2_payment_schedule_runtime ON app.v2_payment_schedule TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_payment_schedule.tenant_id, v2_payment_schedule.job_id)
    ));
  REVOKE ALL ON app.v2_payment_schedule FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_payment_schedule TO jobguard_runtime;
END
$v2$;
COMMIT;
