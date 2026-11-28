-- Q53 / V2-G1. The snag register beside main's QW-4 snag list: a crew owner, which
-- person fixed and checked each snag, and "agreed to leave open at handover".
-- Main's snag tables and routines are unchanged.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.snag_event') IS NULL OR to_regclass('app.v2_crew_contact') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- The owner of a snag: a crew record of the job's firm, or (both null) main's free-text label again.
  CREATE TABLE IF NOT EXISTS app.v2_snag_owner (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    snag_id uuid NOT NULL,
    sequence integer NOT NULL CHECK (sequence >= 1),
    crew_id uuid,
    crew_revision integer,
    firm_key text NOT NULL CHECK (firm_key ~ '^practice:[a-f0-9]{64}$'),
    command_id uuid NOT NULL,
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, snag_id, sequence),
    UNIQUE (tenant_id, command_id),
    CHECK ((crew_id IS NULL) = (crew_revision IS NULL)),
    FOREIGN KEY (tenant_id, job_id, snag_id) REFERENCES app.snag (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, firm_key, crew_id, crew_revision) REFERENCES app.v2_crew_contact (tenant_id, firm_key, crew_id, revision),
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES app.membership (tenant_id, id)
  );
  -- Which person did a fixed, checked or reopened event of main's snag_event.
  CREATE TABLE IF NOT EXISTS app.v2_snag_event_person (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    snag_id uuid NOT NULL,
    event_sequence integer NOT NULL,
    person_kind text NOT NULL CHECK (person_kind IN ('builder', 'crew')),
    crew_id uuid,
    crew_revision integer,
    firm_key text NOT NULL CHECK (firm_key ~ '^practice:[a-f0-9]{64}$'),
    command_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, snag_id, event_sequence),
    UNIQUE (tenant_id, command_id),
    CHECK ((person_kind = 'crew') = (crew_id IS NOT NULL)),
    CHECK ((crew_id IS NULL) = (crew_revision IS NULL)),
    FOREIGN KEY (tenant_id, snag_id, event_sequence) REFERENCES app.snag_event (tenant_id, snag_id, sequence),
    FOREIGN KEY (tenant_id, job_id, snag_id) REFERENCES app.snag (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, firm_key, crew_id, crew_revision) REFERENCES app.v2_crew_contact (tenant_id, firm_key, crew_id, revision)
  );
  -- Agreed with the customer to stay open at handover. Never closes a snag; never money.
  CREATE TABLE IF NOT EXISTS app.v2_snag_agreed (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    snag_id uuid NOT NULL,
    sequence integer NOT NULL CHECK (sequence >= 1),
    agreed boolean NOT NULL,
    note varchar(200) CHECK (note IS NULL OR note = btrim(note)),
    command_id uuid NOT NULL,
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, snag_id, sequence),
    UNIQUE (tenant_id, command_id),
    CHECK (NOT agreed OR char_length(note) BETWEEN 1 AND 200),
    FOREIGN KEY (tenant_id, job_id, snag_id) REFERENCES app.snag (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES app.membership (tenant_id, id)
  );

  -- The row's firm is the job's firm; a person row names an event of its own snag and job,
  -- and a checked event's person is never the person on the latest fixed event before it.
  -- AFTER INSERT, so row security refuses an outsider's row (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_snag_register_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  DECLARE fixer app.v2_snag_event_person; kind text;
  BEGIN
    IF NOT EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (NEW.tenant_id, NEW.job_id)
        AND NEW.firm_key = 'practice:' || j.practice_session_digest) THEN
      RAISE EXCEPTION 'V2_SNAG_FIRM_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'v2_snag_event_person' THEN
      SELECT e.kind INTO kind FROM app.snag_event e
      WHERE (e.tenant_id, e.job_id, e.snag_id, e.sequence) = (NEW.tenant_id, NEW.job_id, NEW.snag_id, NEW.event_sequence);
      IF kind IS NULL THEN RAISE EXCEPTION 'V2_SNAG_EVENT_MISMATCH' USING ERRCODE = '23514'; END IF;
      IF kind = 'checked' THEN
        SELECT p.* INTO fixer FROM app.snag_event e
        JOIN app.v2_snag_event_person p ON (p.tenant_id, p.snag_id, p.event_sequence) = (e.tenant_id, e.snag_id, e.sequence)
        WHERE (e.tenant_id, e.snag_id) = (NEW.tenant_id, NEW.snag_id) AND e.kind = 'fixed' AND e.sequence < NEW.event_sequence
          AND NOT EXISTS (SELECT FROM app.snag_event f WHERE (f.tenant_id, f.snag_id) = (e.tenant_id, e.snag_id)
            AND f.kind = 'fixed' AND f.sequence > e.sequence AND f.sequence < NEW.event_sequence)
        LIMIT 1;
        IF FOUND AND fixer.person_kind = NEW.person_kind AND fixer.crew_id IS NOT DISTINCT FROM NEW.crew_id THEN
          RAISE EXCEPTION 'V2_SNAG_CHECKER_IS_FIXER' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_snag_owner_guard ON app.v2_snag_owner;
  CREATE TRIGGER v2_snag_owner_guard AFTER INSERT ON app.v2_snag_owner
    FOR EACH ROW EXECUTE FUNCTION app.v2_snag_register_guard();
  DROP TRIGGER IF EXISTS v2_snag_event_person_guard ON app.v2_snag_event_person;
  CREATE TRIGGER v2_snag_event_person_guard AFTER INSERT ON app.v2_snag_event_person
    FOR EACH ROW EXECUTE FUNCTION app.v2_snag_register_guard();

  ALTER TABLE app.v2_snag_owner ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_snag_owner FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_snag_event_person ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_snag_event_person FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_snag_agreed ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_snag_agreed FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_snag_owner_runtime ON app.v2_snag_owner;
  CREATE POLICY v2_snag_owner_runtime ON app.v2_snag_owner TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_owner.tenant_id, v2_snag_owner.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_owner.tenant_id, v2_snag_owner.job_id)));
  DROP POLICY IF EXISTS v2_snag_event_person_runtime ON app.v2_snag_event_person;
  CREATE POLICY v2_snag_event_person_runtime ON app.v2_snag_event_person TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_event_person.tenant_id, v2_snag_event_person.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_event_person.tenant_id, v2_snag_event_person.job_id)));
  DROP POLICY IF EXISTS v2_snag_agreed_runtime ON app.v2_snag_agreed;
  CREATE POLICY v2_snag_agreed_runtime ON app.v2_snag_agreed TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_agreed.tenant_id, v2_snag_agreed.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_agreed.tenant_id, v2_snag_agreed.job_id)));
  -- FL: the same restrictive firm lock as every V2 table.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_snag_owner;
  CREATE POLICY v2_practice_firm ON app.v2_snag_owner AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_owner.tenant_id, v2_snag_owner.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_owner.tenant_id, v2_snag_owner.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_snag_event_person;
  CREATE POLICY v2_practice_firm ON app.v2_snag_event_person AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_event_person.tenant_id, v2_snag_event_person.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_event_person.tenant_id, v2_snag_event_person.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_snag_agreed;
  CREATE POLICY v2_practice_firm ON app.v2_snag_agreed AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_agreed.tenant_id, v2_snag_agreed.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_snag_agreed.tenant_id, v2_snag_agreed.job_id)));
  REVOKE ALL ON app.v2_snag_owner, app.v2_snag_event_person, app.v2_snag_agreed
    FROM PUBLIC, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_snag_owner, app.v2_snag_event_person, app.v2_snag_agreed TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_snag_owner_immutable ON app.v2_snag_owner;
  CREATE TRIGGER v2_snag_owner_immutable BEFORE UPDATE OR DELETE ON app.v2_snag_owner
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_snag_event_person_immutable ON app.v2_snag_event_person;
  CREATE TRIGGER v2_snag_event_person_immutable BEFORE UPDATE OR DELETE ON app.v2_snag_event_person
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_snag_agreed_immutable ON app.v2_snag_agreed;
  CREATE TRIGGER v2_snag_agreed_immutable BEFORE UPDATE OR DELETE ON app.v2_snag_agreed
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
END
$v2$;
COMMIT;
