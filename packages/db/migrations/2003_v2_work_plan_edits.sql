BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  ALTER TABLE app.v2_work_plan
    ADD COLUMN IF NOT EXISTS previous_plan_revision_id uuid;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'app.v2_work_plan'::regclass
    AND conname = 'v2_work_plan_previous_fk') THEN
    ALTER TABLE app.v2_work_plan ADD CONSTRAINT v2_work_plan_previous_fk
      FOREIGN KEY (tenant_id, job_id, previous_plan_revision_id)
      REFERENCES app.v2_work_plan (tenant_id, job_id, quote_revision_id);
  END IF;
  CREATE TABLE IF NOT EXISTS app.v2_work_plan_edit (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    quote_revision_id uuid NOT NULL,
    command_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    template_task_key text NOT NULL,
    expected_version integer NOT NULL CHECK (expected_version >= 0),
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object' AND changes <> '{}'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, command_id),
    UNIQUE (tenant_id, job_id, quote_revision_id, expected_version),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id)
      REFERENCES app.v2_work_plan (tenant_id, job_id, quote_revision_id),
    FOREIGN KEY (tenant_id, quote_revision_id, scope_item_id)
      REFERENCES app.quote_line (tenant_id, quote_revision_id, scope_item_id)
  );

  -- Linked V2 sessions share a synthetic membership. Resolve the signed-in
  -- person's membership from their verified linked credential and bound firm.
  CREATE OR REPLACE FUNCTION app.v2_work_plan_editor(credential_digest text)
  RETURNS uuid
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
  AS $actor$
    SELECT c.membership_id
    FROM control_plane.identity_practice_credential c
    CROSS JOIN LATERAL app.linked_practice_authority(c.token_digest::text) authority
    WHERE c.token_digest = credential_digest
      AND (SELECT app.lp11_policy_tenant()) IS NOT NULL
      AND (SELECT app.current_firm_profile_key()) = 'practice:' || authority.owner_digest
  $actor$;
  REVOKE ALL ON FUNCTION app.v2_work_plan_editor(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_work_plan_editor(text) TO jobguard_runtime;

  ALTER TABLE app.v2_work_plan_edit ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_work_plan_edit FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_work_plan_edit_runtime ON app.v2_work_plan_edit;
  CREATE POLICY v2_work_plan_edit_runtime ON app.v2_work_plan_edit TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_work_plan_edit.tenant_id, v2_work_plan_edit.job_id)
    ));
  REVOKE ALL ON app.v2_work_plan_edit FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_work_plan_edit TO jobguard_runtime;
END
$v2$;
COMMIT;
