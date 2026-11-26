BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_fact_reply_request') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- One press of "Run reminders now (practice)". The command id is the replay
  -- identity; an exact retry returns the stored result and sends nothing again.
  CREATE TABLE IF NOT EXISTS app.v2_fact_reminder_run (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id)
  );

  -- At most one reminder and one "unconfirmed" flag per E2 reply request: the
  -- primary key is the "exactly one chase per request" rule. A reminder names
  -- the request's own contact; a flag names its reason and no one.
  CREATE TABLE IF NOT EXISTS app.v2_fact_reminder (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    request_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('reminder', 'unconfirmed')),
    reason text CHECK (reason IS NULL OR reason IN ('no_reply', 'link_expired')),
    due_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL,
    recipient varchar(320) CHECK (recipient IS NULL OR lower(recipient) ~ '@([a-z0-9-]+\.)+invalid$'),
    run_id uuid NOT NULL,
    actor_membership_id uuid NOT NULL,
    PRIMARY KEY (tenant_id, job_id, request_id, kind),
    CHECK ((kind = 'reminder') = (reason IS NULL)),
    CHECK ((kind = 'reminder') = (recipient IS NOT NULL)),
    CHECK (recorded_at >= due_at),
    FOREIGN KEY (tenant_id, job_id, request_id) REFERENCES app.v2_fact_reply_request (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, run_id) REFERENCES app.v2_fact_reminder_run (tenant_id, job_id, id)
  );

  ALTER TABLE app.v2_fact_reminder_run ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reminder_run FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reminder ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reminder FORCE ROW LEVEL SECURITY;

  -- Builder access: the same firm and job-visibility rule as E2 (2029).
  DROP POLICY IF EXISTS v2_fact_reminder_run_runtime ON app.v2_fact_reminder_run;
  CREATE POLICY v2_fact_reminder_run_runtime ON app.v2_fact_reminder_run TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_fact_reminder_run.tenant_id, v2_fact_reminder_run.job_id)
    ));
  DROP POLICY IF EXISTS v2_fact_reminder_runtime ON app.v2_fact_reminder;
  CREATE POLICY v2_fact_reminder_runtime ON app.v2_fact_reminder TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_fact_reminder.tenant_id, v2_fact_reminder.job_id)
    ));

  REVOKE ALL ON app.v2_fact_reminder_run, app.v2_fact_reminder FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_fact_reminder_run, app.v2_fact_reminder TO jobguard_runtime;

  -- Recorded rows never change, even for the owner.
  DROP TRIGGER IF EXISTS v2_fact_reminder_run_immutable ON app.v2_fact_reminder_run;
  CREATE TRIGGER v2_fact_reminder_run_immutable BEFORE UPDATE OR DELETE ON app.v2_fact_reminder_run
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_fact_reminder_immutable ON app.v2_fact_reminder;
  CREATE TRIGGER v2_fact_reminder_immutable BEFORE UPDATE OR DELETE ON app.v2_fact_reminder
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
END
$v2$;

COMMIT;
