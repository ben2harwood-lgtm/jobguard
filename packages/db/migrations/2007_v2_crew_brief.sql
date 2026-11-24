BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- One unpriced brief per trade; the highest revision is the current brief.
  CREATE TABLE IF NOT EXISTS app.v2_crew_brief (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    trade varchar(100) NOT NULL CHECK (btrim(trade) <> ''),
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    quote_revision_id uuid NOT NULL,
    access_window varchar(200) NOT NULL CHECK (btrim(access_window) <> ''),
    content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, trade, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id)
      REFERENCES app.v2_work_plan (tenant_id, job_id, quote_revision_id)
  );

  -- The site photos the builder picked for that brief revision, in order.
  CREATE TABLE IF NOT EXISTS app.v2_crew_brief_photo (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    trade varchar(100) NOT NULL,
    expected_version integer NOT NULL,
    position integer NOT NULL CHECK (position BETWEEN 1 AND 20),
    evidence_id uuid NOT NULL,
    PRIMARY KEY (tenant_id, job_id, trade, expected_version, position),
    UNIQUE (tenant_id, job_id, trade, expected_version, evidence_id),
    FOREIGN KEY (tenant_id, job_id, trade, expected_version)
      REFERENCES app.v2_crew_brief (tenant_id, job_id, trade, expected_version),
    FOREIGN KEY (tenant_id, job_id, evidence_id)
      REFERENCES app.evidence_object (tenant_id, job_id, id)
  );

  ALTER TABLE app.v2_crew_brief ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_brief FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_brief_photo ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_brief_photo FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS v2_crew_brief_runtime ON app.v2_crew_brief;
  CREATE POLICY v2_crew_brief_runtime ON app.v2_crew_brief TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_crew_brief.tenant_id, v2_crew_brief.job_id)
    ));

  DROP POLICY IF EXISTS v2_crew_brief_photo_runtime ON app.v2_crew_brief_photo;
  CREATE POLICY v2_crew_brief_photo_runtime ON app.v2_crew_brief_photo TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_crew_brief_photo.tenant_id, v2_crew_brief_photo.job_id)
    ));

  REVOKE ALL ON app.v2_crew_brief, app.v2_crew_brief_photo FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_crew_brief, app.v2_crew_brief_photo TO jobguard_runtime;
END
$v2$;
COMMIT;
