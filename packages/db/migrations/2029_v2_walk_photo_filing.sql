BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_walk_photo_filing (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    session_id uuid NOT NULL,
    capture_order integer NOT NULL CHECK (capture_order BETWEEN 1 AND 100000),
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    room_capture_order integer NOT NULL CHECK (room_capture_order BETWEEN 1 AND 100000),
    reason text NOT NULL CHECK (reason IN ('misfiled', 'no_room', 'waiting')),
    actor_membership_id uuid NOT NULL,
    server_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, session_id, capture_order, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, session_id) REFERENCES app.v2_walk_session (tenant_id, job_id, id)
  );
  CREATE OR REPLACE FUNCTION app.v2_walk_photo_filing_guard()
  RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
  BEGIN
    -- BEFORE triggers run before the INSERT policy. Hidden jobs must reach the
    -- RLS refusal rather than the source/target checks below.
    IF NOT EXISTS (SELECT FROM app.job j
      WHERE (j.tenant_id, j.id) = (NEW.tenant_id, NEW.job_id)) THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT FROM app.v2_walk_entry
      WHERE (tenant_id, job_id, session_id, capture_order) = (NEW.tenant_id, NEW.job_id, NEW.session_id, NEW.capture_order)
        AND kind = 'photo') OR NOT EXISTS (SELECT FROM app.v2_walk_entry
      WHERE (tenant_id, job_id, session_id, capture_order) = (NEW.tenant_id, NEW.job_id, NEW.session_id, NEW.room_capture_order)
        AND kind = 'room') THEN
      RAISE EXCEPTION 'V2_WALK_PHOTO_FILING_TARGET_REFUSED' USING ERRCODE = '23514';
    END IF;
    IF NEW.expected_version > 0 AND NOT EXISTS (SELECT FROM app.v2_walk_photo_filing
      WHERE (tenant_id, job_id, session_id, capture_order, expected_version) =
        (NEW.tenant_id, NEW.job_id, NEW.session_id, NEW.capture_order, NEW.expected_version - 1)) THEN
      RAISE EXCEPTION 'V2_WALK_VERSION_GAP' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END $guard$;
  REVOKE ALL ON FUNCTION app.v2_walk_photo_filing_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_walk_photo_filing_guard ON app.v2_walk_photo_filing;
  CREATE TRIGGER v2_walk_photo_filing_guard BEFORE INSERT ON app.v2_walk_photo_filing
    FOR EACH ROW EXECUTE FUNCTION app.v2_walk_photo_filing_guard();
  ALTER TABLE app.v2_walk_photo_filing ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_walk_photo_filing FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_walk_photo_filing_runtime ON app.v2_walk_photo_filing;
  CREATE POLICY v2_walk_photo_filing_runtime ON app.v2_walk_photo_filing TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_walk_photo_filing.tenant_id, v2_walk_photo_filing.job_id)
    ));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_walk_photo_filing;
  CREATE POLICY v2_practice_firm ON app.v2_walk_photo_filing AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j
      WHERE (j.tenant_id, j.id) = (v2_walk_photo_filing.tenant_id, v2_walk_photo_filing.job_id)));
  REVOKE ALL ON app.v2_walk_photo_filing FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_walk_photo_filing TO jobguard_runtime;
END $v2$;
COMMIT;
