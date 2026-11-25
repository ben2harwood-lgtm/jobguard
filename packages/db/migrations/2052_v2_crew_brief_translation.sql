BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;
  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_crew_brief_translation (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    trade varchar(100) NOT NULL,
    -- Stored brief keys are zero-based; the API's displayed brief version is this + 1.
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    lang text NOT NULL CHECK (lang IN ('pl','ro','pt','lt','bg')),
    provider text NOT NULL CHECK (provider = 'fake'),
    command_id uuid NOT NULL,
    content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
    source_text_hash text NOT NULL CHECK (source_text_hash ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor_membership_id uuid NOT NULL,
    PRIMARY KEY (tenant_id, job_id, trade, expected_version, lang),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, trade, expected_version)
      REFERENCES app.v2_crew_brief (tenant_id, job_id, trade, expected_version)
  );
  ALTER TABLE app.v2_crew_brief_translation ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_brief_translation FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_crew_brief_translation_runtime ON app.v2_crew_brief_translation;
  CREATE POLICY v2_crew_brief_translation_runtime ON app.v2_crew_brief_translation TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) =
        (v2_crew_brief_translation.tenant_id, v2_crew_brief_translation.job_id)
    ));
  IF NOT EXISTS (SELECT FROM pg_policy
    WHERE polrelid = 'app.v2_crew_brief_translation'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    CREATE POLICY v2_practice_firm ON app.v2_crew_brief_translation AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) =
        (v2_crew_brief_translation.tenant_id, v2_crew_brief_translation.job_id)));
  END IF;
  REVOKE ALL ON app.v2_crew_brief_translation FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_crew_brief_translation TO jobguard_runtime;
END
$v2$;
COMMIT;
