-- Q28 / V2-C3C. Firm-owned crew contacts, and task assignment bound to one.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- A crew record belongs to the firm, not to a job. Rows are immutable:
  -- a correction is the next revision of the same crew_id, in the same firm.
  CREATE TABLE IF NOT EXISTS app.v2_crew_contact (
    tenant_id uuid NOT NULL,
    firm_key text NOT NULL CHECK (firm_key ~ '^practice:[a-f0-9]{64}$'),
    crew_id uuid NOT NULL,
    revision integer NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
    previous_revision integer,
    command_id uuid NOT NULL,
    display_name text NOT NULL CHECK (display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 100),
    trade text NOT NULL CHECK (trade = btrim(trade) AND length(trade) BETWEEN 1 AND 100),
    -- Practice data only: Ofcom's drama ranges (07700 900xxx, 01632 960xxx, 020 7946 0xxx).
    phone text NOT NULL CHECK (phone ~ '^(07700900[0-9]{3}|01632960[0-9]{3}|02079460[0-9]{3})$'),
    email text CHECK (email ~ '^[a-z0-9._+-]{1,64}@([a-z0-9-]{1,63}\.)*invalid$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, crew_id, revision),
    UNIQUE (tenant_id, firm_key, crew_id, revision),
    UNIQUE (tenant_id, firm_key, command_id),
    CHECK ((revision = 1 AND previous_revision IS NULL) OR previous_revision = revision - 1),
    FOREIGN KEY (tenant_id, firm_key, crew_id, previous_revision)
      REFERENCES app.v2_crew_contact (tenant_id, firm_key, crew_id, revision)
  );
  ALTER TABLE app.v2_crew_contact ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_contact FORCE ROW LEVEL SECURITY;
  -- V2 practice firms share one backing tenant, so isolate by firm as well as tenant.
  DROP POLICY IF EXISTS v2_crew_contact_runtime ON app.v2_crew_contact;
  CREATE POLICY v2_crew_contact_runtime ON app.v2_crew_contact TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND firm_key = (SELECT app.current_firm_profile_key()))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND firm_key = (SELECT app.current_firm_profile_key()));
  REVOKE ALL ON app.v2_crew_contact FROM PUBLIC, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_crew_contact TO jobguard_runtime;

  -- An edit that sets assigneeRef must name a crew record of the job's own firm.
  -- AFTER INSERT, so row security refuses an outsider's edit (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_work_plan_assignee_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF jsonb_typeof(NEW.changes -> 'assigneeRef') = 'string' AND NOT EXISTS (
      SELECT FROM app.v2_crew_contact c
      JOIN app.job j ON (j.tenant_id, j.id) = (NEW.tenant_id, NEW.job_id)
      WHERE c.tenant_id = NEW.tenant_id AND c.crew_id::text = NEW.changes ->> 'assigneeRef'
        AND c.firm_key = 'practice:' || j.practice_session_digest
    ) THEN
      RAISE EXCEPTION 'CREW_CONTACT_UNAVAILABLE' USING ERRCODE = '23503';
    END IF;
    IF NEW.changes ? 'assigneeRef' AND jsonb_typeof(NEW.changes -> 'assigneeRef') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'CREW_CONTACT_UNAVAILABLE' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END
  $guard$;
  REVOKE ALL ON FUNCTION app.v2_work_plan_assignee_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_work_plan_assignee_guard ON app.v2_work_plan_edit;
  CREATE TRIGGER v2_work_plan_assignee_guard AFTER INSERT ON app.v2_work_plan_edit
    FOR EACH ROW EXECUTE FUNCTION app.v2_work_plan_assignee_guard();
END
$v2$;
COMMIT;
