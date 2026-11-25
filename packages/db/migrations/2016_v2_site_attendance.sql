-- Q10 / V2-F8. Who was on site today: one tap per person per job per day.
-- No location, IP address, device or user agent is stored anywhere.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- Rows are immutable. A second tap for the same person on the same job and day is a
  -- replay (same command) or the next revision (an edit: the note, or "not on site").
  CREATE TABLE IF NOT EXISTS app.v2_site_attendance (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    -- The site day in Europe/London.
    day date NOT NULL,
    person_kind text NOT NULL CHECK (person_kind IN ('crew', 'builder')),
    -- A crew record of the job's own firm (checked below), or the builder who tapped "Me".
    crew_id uuid,
    builder_membership_id uuid,
    person_ref uuid GENERATED ALWAYS AS (coalesce(crew_id, builder_membership_id)) STORED,
    revision integer NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
    expected_version integer NOT NULL CHECK (expected_version = revision - 1),
    previous_revision integer GENERATED ALWAYS AS (nullif(expected_version, 0)) STORED,
    command_id uuid NOT NULL,
    on_site boolean NOT NULL,
    note text CHECK (note = btrim(note) AND length(note) BETWEEN 1 AND 500),
    tapped_by_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, day, person_kind, person_ref, revision),
    -- One command id names one tap in the tenant, whichever job it was sent for.
    UNIQUE (tenant_id, command_id),
    CHECK ((person_kind = 'crew') = (crew_id IS NOT NULL)),
    CHECK ((person_kind = 'builder') = (builder_membership_id IS NOT NULL)),
    -- "Me" is always the person who tapped it.
    CHECK (builder_membership_id IS NULL OR builder_membership_id = tapped_by_membership_id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id),
    FOREIGN KEY (tenant_id, job_id, day, person_kind, person_ref, previous_revision)
      REFERENCES app.v2_site_attendance (tenant_id, job_id, day, person_kind, person_ref, revision)
  );
  ALTER TABLE app.v2_site_attendance ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_site_attendance FORCE ROW LEVEL SECURITY;
  -- app.job carries the restrictive v2_practice_firm policy, so a row is visible only while
  -- its job is visible to the signed-in firm in the shared practice tenant.
  DROP POLICY IF EXISTS v2_site_attendance_runtime ON app.v2_site_attendance;
  CREATE POLICY v2_site_attendance_runtime ON app.v2_site_attendance TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_site_attendance.tenant_id, v2_site_attendance.job_id)
    ))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_site_attendance.tenant_id, v2_site_attendance.job_id)
    ));
  REVOKE ALL ON app.v2_site_attendance FROM PUBLIC, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_site_attendance TO jobguard_runtime;

  -- A crew tap must name a crew record of the job's own firm (2027's assignee guard pattern),
  -- and the day must be today or one of the six days before it, in Europe/London.
  -- AFTER INSERT, so row security refuses an outsider's tap (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_site_attendance_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  DECLARE
    today date := (clock_timestamp() AT TIME ZONE 'Europe/London')::date;
  BEGIN
    IF NEW.day > today OR NEW.day < today - 6 THEN
      RAISE EXCEPTION 'SITE_ATTENDANCE_DAY_OUT_OF_RANGE' USING ERRCODE = '23514';
    END IF;
    IF NEW.person_kind = 'crew' AND NOT EXISTS (
      SELECT FROM app.v2_crew_contact c
      JOIN app.job j ON (j.tenant_id, j.id) = (NEW.tenant_id, NEW.job_id)
      WHERE c.tenant_id = NEW.tenant_id AND c.crew_id = NEW.crew_id
        AND c.firm_key = 'practice:' || j.practice_session_digest
    ) THEN
      RAISE EXCEPTION 'CREW_CONTACT_UNAVAILABLE' USING ERRCODE = '23503';
    END IF;
    RETURN NULL;
  END
  $guard$;
  REVOKE ALL ON FUNCTION app.v2_site_attendance_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_site_attendance_guard ON app.v2_site_attendance;
  CREATE TRIGGER v2_site_attendance_guard AFTER INSERT ON app.v2_site_attendance
    FOR EACH ROW EXECUTE FUNCTION app.v2_site_attendance_guard();
END
$v2$;
COMMIT;
