BEGIN;

DO $v2$
BEGIN
  -- The shared runner discovers this file. Only the checked V2 bootstrap,
  -- after 2001 has installed the firm boundary, changes these records.
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- A variation stores no direction apart from the sign of its money. For an
  -- approved no-charge revision the builder says once whether it adds or
  -- removes work. The answer never changes money.
  CREATE TABLE IF NOT EXISTS app.v2_extra_direction (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    variation_revision_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    direction text NOT NULL CHECK (direction IN ('adds_work', 'removes_work')),
    quote_revision_id uuid NOT NULL,
    command_id uuid NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, variation_revision_id),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, variation_revision_id) REFERENCES app.variation_revision (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, scope_item_id) REFERENCES app.scope_identity (tenant_id, job_id, id),
    -- The actor is the signed-in person's own membership from app.v2_work_plan_editor(), which lives in
    -- their firm, not the shared practice tenant, so it has no tenant foreign key (as in 2003).
    FOREIGN KEY (tenant_id, job_id, quote_revision_id) REFERENCES app.v2_work_plan (tenant_id, job_id, quote_revision_id)
  );

  CREATE OR REPLACE FUNCTION app.v2_extra_direction_check()
  RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
  AS $check$
  BEGIN
    IF NOT EXISTS (SELECT FROM app.variation_revision r
      JOIN app.variation_approval a ON (a.tenant_id, a.job_id, a.revision_id, a.revision, a.content_hash, a.signed_delta_pence)
        = (r.tenant_id, r.job_id, r.id, r.revision, r.content_hash, r.signed_delta_pence)
      WHERE (r.tenant_id, r.job_id, r.id, r.scope_item_id)
        = (NEW.tenant_id, NEW.job_id, NEW.variation_revision_id, NEW.scope_item_id)
        AND r.signed_delta_pence = 0) THEN
      RAISE EXCEPTION 'V2 extra direction needs an approved no-charge revision of its scope item'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NULL;
  END
  $check$;
  REVOKE ALL ON FUNCTION app.v2_extra_direction_check() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_extra_direction_check ON app.v2_extra_direction;
  -- AFTER, so the firm's row-level security check refuses an outsider first.
  CREATE TRIGGER v2_extra_direction_check AFTER INSERT ON app.v2_extra_direction
    FOR EACH ROW EXECUTE FUNCTION app.v2_extra_direction_check();
  DROP TRIGGER IF EXISTS v2_extra_direction_immutable ON app.v2_extra_direction;
  CREATE TRIGGER v2_extra_direction_immutable BEFORE UPDATE OR DELETE ON app.v2_extra_direction
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  ALTER TABLE app.v2_extra_direction ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_extra_direction FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_extra_direction_runtime ON app.v2_extra_direction;
  CREATE POLICY v2_extra_direction_runtime ON app.v2_extra_direction TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_extra_direction.tenant_id, v2_extra_direction.job_id)
    ));
  REVOKE ALL ON app.v2_extra_direction FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_extra_direction TO jobguard_runtime;

  -- 2020's check, changed only where it accepts an extra's edit: a positive
  -- revision, or a no-charge revision the builder said adds work.
  CREATE OR REPLACE FUNCTION app.v2_work_plan_edit_scope_check()
  RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
  AS $check$
  BEGIN
    IF NEW.variation_revision_id IS NULL THEN
      IF NOT EXISTS (SELECT FROM app.quote_line l
        WHERE (l.tenant_id, l.job_id, l.quote_revision_id, l.scope_item_id)
          = (NEW.tenant_id, NEW.job_id, NEW.quote_revision_id, NEW.scope_item_id)) THEN
        RAISE EXCEPTION 'V2 plan edit scope item is not on its quote revision'
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    ELSIF NOT EXISTS (SELECT FROM app.variation_revision r
      JOIN app.variation_approval a ON (a.tenant_id, a.job_id, a.revision_id, a.revision, a.content_hash, a.signed_delta_pence)
        = (r.tenant_id, r.job_id, r.id, r.revision, r.content_hash, r.signed_delta_pence)
      WHERE (r.tenant_id, r.job_id, r.id, r.scope_item_id)
        = (NEW.tenant_id, NEW.job_id, NEW.variation_revision_id, NEW.scope_item_id)
        -- Only work to plan: an approved addition, or a no-charge extra the builder said adds work.
        AND (r.signed_delta_pence > 0 OR (r.signed_delta_pence = 0 AND EXISTS (SELECT FROM app.v2_extra_direction d
          WHERE (d.tenant_id, d.job_id, d.variation_revision_id, d.direction)
            = (r.tenant_id, r.job_id, r.id, 'adds_work'))))) THEN
      RAISE EXCEPTION 'V2 plan edit extra is not an approved addition revision of its scope item'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NULL;
  END
  $check$;
END
$v2$;
COMMIT;
