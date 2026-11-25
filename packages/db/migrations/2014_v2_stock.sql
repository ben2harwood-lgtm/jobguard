BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;
  SET LOCAL ROLE jobguard_migration;
  -- Immutable delivery snapshots. Receipt quantities are cumulative, never forecasts.
  CREATE TABLE IF NOT EXISTS app.v2_stock_delivery (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    line_key varchar(64) NOT NULL,
    material_line_revision integer NOT NULL,
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    command jsonb NOT NULL CHECK (jsonb_typeof(command) = 'object'),
    supplier varchar(200) NOT NULL CHECK (length(trim(supplier)) > 0),
    packs_expected bigint NOT NULL CHECK (packs_expected BETWEEN 1 AND 999999999),
    forecast_date date NOT NULL,
    confirmed_date date,
    status varchar(20) NOT NULL CHECK (status IN ('forecast', 'date_confirmed', 'delivered')),
    packs_received bigint NOT NULL CHECK (packs_received BETWEEN 0 AND packs_expected),
    received_by_membership_id uuid,
    received_at timestamptz,
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, delivery_id, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, scope_item_id, line_key, material_line_revision)
      REFERENCES app.v2_material_line (tenant_id, job_id, scope_item_id, line_key, expected_version),
    CHECK ((status = 'delivered' AND packs_received > 0 AND received_at IS NOT NULL AND received_by_membership_id IS NOT NULL)
      OR (status <> 'delivered' AND packs_received = 0 AND received_at IS NULL AND received_by_membership_id IS NULL)),
    CHECK (status <> 'date_confirmed' OR confirmed_date IS NOT NULL)
  );
  ALTER TABLE app.v2_stock_delivery ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_stock_delivery FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_stock_delivery_runtime ON app.v2_stock_delivery;
  CREATE POLICY v2_stock_delivery_runtime ON app.v2_stock_delivery TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_stock_delivery.tenant_id, v2_stock_delivery.job_id)
    ));
  REVOKE ALL ON app.v2_stock_delivery FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_stock_delivery TO jobguard_runtime;
END
$v2$;
COMMIT;
