BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- Append-only builder revisions of one material line on a scope item. Each
  -- revision holds only the fields it changed; readers fold them in order.
  CREATE TABLE IF NOT EXISTS app.v2_material_line (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    line_key varchar(64) NOT NULL CHECK (line_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object' AND changes <> '{}'),
    -- The calculated packs a builder's pack override was set against, when it could be calculated.
    override_basis_packs bigint CHECK (override_basis_packs >= 0),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, scope_item_id, line_key, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, scope_item_id)
      REFERENCES app.scope_identity (tenant_id, job_id, id)
  );

  -- Generated enquiry versions. Whether one is current is worked out on read
  -- by comparing its basis with the live inputs; nothing is ever updated.
  CREATE TABLE IF NOT EXISTS app.v2_material_enquiry (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
    command_id uuid NOT NULL,
    basis_digest char(64) NOT NULL CHECK (basis_digest ~ '^[0-9a-f]{64}$'),
    basis jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'array'),
    content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
    actor_membership_id uuid NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id)
  );

  -- Every accepted generate command, including one that returned an enquiry
  -- that was already current, so an exact retry replays the same result.
  CREATE TABLE IF NOT EXISTS app.v2_material_enquiry_command (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    command_id uuid NOT NULL,
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    enquiry_version integer NOT NULL,
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, enquiry_version)
      REFERENCES app.v2_material_enquiry (tenant_id, job_id, version)
  );

  ALTER TABLE app.v2_material_line ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_material_line FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_material_enquiry ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_material_enquiry FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_material_enquiry_command ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_material_enquiry_command FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS v2_material_line_runtime ON app.v2_material_line;
  CREATE POLICY v2_material_line_runtime ON app.v2_material_line TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_material_line.tenant_id, v2_material_line.job_id)
    ));

  DROP POLICY IF EXISTS v2_material_enquiry_runtime ON app.v2_material_enquiry;
  CREATE POLICY v2_material_enquiry_runtime ON app.v2_material_enquiry TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_material_enquiry.tenant_id, v2_material_enquiry.job_id)
    ));

  DROP POLICY IF EXISTS v2_material_enquiry_command_runtime ON app.v2_material_enquiry_command;
  CREATE POLICY v2_material_enquiry_command_runtime ON app.v2_material_enquiry_command TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j
      WHERE (j.tenant_id, j.id) = (v2_material_enquiry_command.tenant_id, v2_material_enquiry_command.job_id)
    ));

  REVOKE ALL ON app.v2_material_line, app.v2_material_enquiry, app.v2_material_enquiry_command FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_material_line, app.v2_material_enquiry, app.v2_material_enquiry_command
    TO jobguard_runtime;
END
$v2$;
COMMIT;
