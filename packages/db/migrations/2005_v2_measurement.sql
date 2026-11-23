BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- One current measurement per scope item, projected from its append-only revisions.
  CREATE TABLE IF NOT EXISTS app.v2_measurement (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    quantity varchar(40) NOT NULL CHECK (
      quantity ~ '^(0|[1-9][0-9]*)([.][0-9]{1,6})?$' AND quantity ~ '[1-9]'
    ),
    unit varchar(40) NOT NULL CHECK (btrim(unit) <> ''),
    source text NOT NULL CHECK (source = 'builder_typed'),
    confirmed boolean NOT NULL,
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, scope_item_id, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, scope_item_id)
      REFERENCES app.scope_identity (tenant_id, job_id, id)
  );

  ALTER TABLE app.v2_measurement ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_measurement FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_measurement_runtime ON app.v2_measurement;
  CREATE POLICY v2_measurement_runtime ON app.v2_measurement TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_measurement.tenant_id, v2_measurement.job_id)
    ));
  REVOKE ALL ON app.v2_measurement FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_measurement TO jobguard_runtime;
END
$v2$;
COMMIT;
