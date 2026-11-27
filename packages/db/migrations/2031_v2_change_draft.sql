-- Q55 / V2-F3. A change draft binds one priced existing-scope variation revision to
-- the accepted quote line it changes, with proposed extra time and material needs.
-- Never money: the price stays on main's variation_revision, written by its own path.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.variation_revision') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_change_draft (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    variation_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    quote_line_id uuid NOT NULL,
    accepted_quantity varchar(40) NOT NULL CHECK (accepted_quantity ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
    new_quantity varchar(40) NOT NULL CHECK (new_quantity ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
    direction text NOT NULL CHECK (direction IN ('addition', 'omission')),
    command_id uuid NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, revision_id),
    UNIQUE (tenant_id, command_id),
    CHECK (accepted_quantity::numeric <> new_quantity::numeric),
    CHECK ((direction = 'addition') = (new_quantity::numeric > accepted_quantity::numeric)),
    FOREIGN KEY (tenant_id, job_id, variation_id) REFERENCES app.variation (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, revision_id) REFERENCES app.variation_revision (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, quote_line_id) REFERENCES app.quote_line (tenant_id, id),
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES app.membership (tenant_id, id)
  );
  CREATE TABLE IF NOT EXISTS app.v2_change_draft_task (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    task_key varchar(200) NOT NULL CHECK (btrim(task_key) <> ''),
    proposed_minutes integer NOT NULL CHECK (proposed_minutes BETWEEN 0 AND 10080),
    material_needs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(material_needs) <= 50),
    PRIMARY KEY (tenant_id, job_id, revision_id, task_key),
    FOREIGN KEY (tenant_id, job_id, revision_id) REFERENCES app.v2_change_draft (tenant_id, job_id, revision_id)
  );

  -- The draft must describe its revision exactly: |new - accepted| in the line's unit, where accepted is the
  -- line as currently agreed (the latest approved change on the line, else the quote quantity),
  -- on the line's own scope item, for a line of the same job, in the stated direction.
  CREATE OR REPLACE FUNCTION app.v2_change_draft_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF NOT EXISTS (
      SELECT FROM app.variation_revision r
      JOIN app.variation v ON (v.tenant_id, v.job_id, v.id) = (r.tenant_id, r.job_id, r.variation_id)
      JOIN app.quote_line l ON (l.tenant_id, l.id) = (NEW.tenant_id, NEW.quote_line_id)
      WHERE (r.tenant_id, r.job_id, r.id) = (NEW.tenant_id, NEW.job_id, NEW.revision_id)
        AND v.id = NEW.variation_id AND l.job_id = NEW.job_id
        AND v.existing_scope_item_id = l.scope_item_id AND v.scope_item_id = l.scope_item_id
        AND l.quantity_decimal IS NOT NULL AND NEW.accepted_quantity::numeric = coalesce((SELECT d.new_quantity::numeric
          FROM app.v2_change_draft d JOIN app.variation av ON (av.tenant_id, av.job_id, av.id) = (d.tenant_id, d.job_id, d.variation_id)
          WHERE (d.tenant_id, d.job_id, d.quote_line_id) = (NEW.tenant_id, NEW.job_id, NEW.quote_line_id)
            AND av.state = 'approved' AND d.variation_id <> NEW.variation_id
          ORDER BY d.recorded_at DESC, d.revision_id DESC LIMIT 1), l.quantity_decimal::numeric)
        AND r.unit = l.unit
        AND r.quantity_decimal::numeric = abs(NEW.new_quantity::numeric - NEW.accepted_quantity::numeric)
        AND (r.signed_delta_pence = 0 OR (r.signed_delta_pence > 0) = (NEW.direction = 'addition'))
    ) THEN
      RAISE EXCEPTION 'V2_CHANGE_DRAFT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_change_draft_guard ON app.v2_change_draft;
  CREATE TRIGGER v2_change_draft_guard AFTER INSERT ON app.v2_change_draft
    FOR EACH ROW EXECUTE FUNCTION app.v2_change_draft_guard();

  ALTER TABLE app.v2_change_draft ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_change_draft FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_change_draft_task ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_change_draft_task FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_change_draft_runtime ON app.v2_change_draft;
  CREATE POLICY v2_change_draft_runtime ON app.v2_change_draft TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_change_draft.tenant_id, v2_change_draft.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_change_draft.tenant_id, v2_change_draft.job_id)));
  DROP POLICY IF EXISTS v2_change_draft_task_runtime ON app.v2_change_draft_task;
  CREATE POLICY v2_change_draft_task_runtime ON app.v2_change_draft_task TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_change_draft_task.tenant_id, v2_change_draft_task.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_change_draft_task.tenant_id, v2_change_draft_task.job_id)));
  REVOKE ALL ON app.v2_change_draft, app.v2_change_draft_task
    FROM PUBLIC, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_change_draft, app.v2_change_draft_task TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_change_draft_immutable ON app.v2_change_draft;
  CREATE TRIGGER v2_change_draft_immutable BEFORE UPDATE OR DELETE ON app.v2_change_draft
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_change_draft_task_immutable ON app.v2_change_draft_task;
  CREATE TRIGGER v2_change_draft_task_immutable BEFORE UPDATE OR DELETE ON app.v2_change_draft_task
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  -- V2-FL: the shared practice tenant holds several firms, so both job-bound tables carry the
  -- restrictive firm lock that 2001 and 2047 put on every job-bound table (2047's direct rule).
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_change_draft;
  CREATE POLICY v2_practice_firm ON app.v2_change_draft AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_change_draft.tenant_id, v2_change_draft.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_change_draft_task;
  CREATE POLICY v2_practice_firm ON app.v2_change_draft_task AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_change_draft_task.tenant_id, v2_change_draft_task.job_id)));
END
$v2$;
COMMIT;
