BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  -- Observations only. These rows never satisfy a proof or completion gate.
  CREATE TABLE IF NOT EXISTS app.v2_brief_progress (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    command_id uuid NOT NULL,
    trade varchar(100) NOT NULL CHECK (btrim(trade) <> ''),
    brief_version integer NOT NULL CHECK (brief_version BETWEEN 0 AND 2147483645),
    scope_item_id uuid NOT NULL,
    task_key varchar(200) NOT NULL CHECK (btrim(task_key) <> ''),
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    kind text NOT NULL CHECK (kind IN ('done', 'blocked', 'changed')),
    note varchar(2000) NOT NULL CHECK (kind = 'done' OR btrim(note) <> ''),
    photo_reference uuid CHECK (photo_reference IS NULL),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, command_id),
    UNIQUE (tenant_id, job_id, trade, scope_item_id, task_key, expected_version),
    FOREIGN KEY (tenant_id, job_id, trade, brief_version)
      REFERENCES app.v2_crew_brief (tenant_id, job_id, trade, expected_version),
    FOREIGN KEY (tenant_id, job_id, scope_item_id) REFERENCES app.scope_identity (tenant_id, job_id, id)
  );
  ALTER TABLE app.v2_brief_progress ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_brief_progress FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_brief_progress_runtime ON app.v2_brief_progress;
  CREATE POLICY v2_brief_progress_runtime ON app.v2_brief_progress TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_brief_progress.tenant_id, v2_brief_progress.job_id)
    ));
  REVOKE ALL ON app.v2_brief_progress FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_brief_progress TO jobguard_runtime;
  -- The existing job-stage guard refuses closed jobs and post-lock site work.
  DROP TRIGGER IF EXISTS v2_brief_progress_stage ON app.v2_brief_progress;
  CREATE TRIGGER v2_brief_progress_stage BEFORE INSERT ON app.v2_brief_progress
    FOR EACH ROW EXECUTE FUNCTION app.ch4_guard_new_site_work();
  DROP TRIGGER IF EXISTS v2_brief_progress_live ON app.v2_brief_progress;
  CREATE TRIGGER v2_brief_progress_live BEFORE INSERT ON app.v2_brief_progress
    FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
  -- Codex P2 4705000559: progress command ids share the tenant-wide watchdog namespace. record() claims
  -- 'v2.brief_progress.record' before inserting, so no other watchdog command can reuse the id, and back.
  -- Extend the existing check as 0734 does; rerunning leaves it unchanged.
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'app.watchdog_command_identity'::regclass
    AND conname = 'watchdog_command_identity_command_type_check'
    AND pg_get_constraintdef(oid) LIKE '%v2.brief_progress.record%') THEN
    DECLARE definition text; BEGIN
      SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
      WHERE conrelid = 'app.watchdog_command_identity'::regclass AND conname = 'watchdog_command_identity_command_type_check';
      IF definition IS NULL OR left(definition, 7) <> 'CHECK (' THEN RAISE EXCEPTION 'unexpected watchdog command identity constraint'; END IF;
      ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
      EXECUTE 'ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK ('
        || substring(definition FROM 8 FOR length(definition) - 8) || ' OR command_type = ''v2.brief_progress.record'')';
    END;
  END IF;
END
$v2$;
COMMIT;
