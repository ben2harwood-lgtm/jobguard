BEGIN;
DO $v2$
DECLARE
  old_fk text;
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  -- K5A-2 fix 1: custom-scope-item tasks live only in the effective plan, and an approved extra's tasks have their
  -- own scope identity with no accepted quote line (Codex P2 4711178089). A task confirmation binds the job's scope
  -- identity, which covers both. The command checks the effective plan in its transaction.
  FOR old_fk IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'app.v2_payment_schedule_task_done'::regclass AND contype = 'f'
      AND confrelid IN ('app.v2_work_plan_task'::regclass, 'app.quote_line'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE app.v2_payment_schedule_task_done DROP CONSTRAINT %I', old_fk);
  END LOOP;
  IF NOT EXISTS (SELECT FROM pg_constraint
    WHERE conrelid = 'app.v2_payment_schedule_task_done'::regclass AND conname = 'v2_payment_schedule_task_done_scope_fkey') THEN
    ALTER TABLE app.v2_payment_schedule_task_done ADD CONSTRAINT v2_payment_schedule_task_done_scope_fkey
      FOREIGN KEY (tenant_id, job_id, scope_item_id)
      REFERENCES app.scope_identity (tenant_id, job_id, id);
  END IF;
  -- K5A-2 fix 2: a stage's amount is frozen when it becomes due. Working plan only: no invoice, send or money movement.
  CREATE TABLE IF NOT EXISTS app.v2_payment_stage_due (
    tenant_id uuid NOT NULL, job_id uuid NOT NULL, quote_revision_id uuid NOT NULL,
    stage_index integer NOT NULL CHECK (stage_index BETWEEN 0 AND 19),
    command_id uuid NOT NULL, due_at timestamptz NOT NULL,
    amount_pence bigint NOT NULL, counted_approval_ids uuid[] NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, quote_revision_id, stage_index),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id)
      REFERENCES app.v2_payment_schedule(tenant_id, job_id, quote_revision_id)
  );
  ALTER TABLE app.v2_payment_stage_due ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_payment_stage_due FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_payment_stage_due_runtime ON app.v2_payment_stage_due;
  CREATE POLICY v2_payment_stage_due_runtime ON app.v2_payment_stage_due TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_payment_stage_due.tenant_id, v2_payment_stage_due.job_id)
    ));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_payment_stage_due;
  CREATE POLICY v2_practice_firm ON app.v2_payment_stage_due AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_payment_stage_due.tenant_id, v2_payment_stage_due.job_id)));
  REVOKE ALL ON app.v2_payment_stage_due FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_payment_stage_due TO jobguard_runtime;
END
$v2$;
COMMIT;
