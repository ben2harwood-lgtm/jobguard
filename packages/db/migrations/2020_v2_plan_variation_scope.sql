BEGIN;

DO $v2$
DECLARE
  quote_line_fk text;
BEGIN
  -- The shared runner discovers this file. Only the checked V2 bootstrap,
  -- after 2001 has installed the firm boundary, changes these records.
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- A plan edit on an approved extra names the exact approved variation
  -- revision it was made against. A quote-line edit leaves it empty.
  ALTER TABLE app.v2_work_plan_edit ADD COLUMN IF NOT EXISTS variation_revision_id uuid;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'app.v2_work_plan_edit'::regclass
    AND conname = 'v2_work_plan_edit_variation_revision_fk') THEN
    ALTER TABLE app.v2_work_plan_edit ADD CONSTRAINT v2_work_plan_edit_variation_revision_fk
      FOREIGN KEY (tenant_id, job_id, variation_revision_id)
      REFERENCES app.variation_revision (tenant_id, job_id, id);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid = 'app.v2_work_plan_edit'::regclass
    AND conname = 'v2_work_plan_edit_scope_identity_fk') THEN
    ALTER TABLE app.v2_work_plan_edit ADD CONSTRAINT v2_work_plan_edit_scope_identity_fk
      FOREIGN KEY (tenant_id, job_id, scope_item_id)
      REFERENCES app.scope_identity (tenant_id, job_id, id);
  END IF;

  -- The quote-line key cannot hold an extra's scope item. The trigger below
  -- keeps the same guarantee for quote-line edits and adds one for extras.
  SELECT conname INTO quote_line_fk FROM pg_constraint
  WHERE conrelid = 'app.v2_work_plan_edit'::regclass AND contype = 'f'
    AND confrelid = 'app.quote_line'::regclass;
  IF quote_line_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.v2_work_plan_edit DROP CONSTRAINT %I', quote_line_fk);
  END IF;

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
        = (NEW.tenant_id, NEW.job_id, NEW.variation_revision_id, NEW.scope_item_id)) THEN
      RAISE EXCEPTION 'V2 plan edit extra is not an approved variation revision of its scope item'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NULL;
  END
  $check$;
  REVOKE ALL ON FUNCTION app.v2_work_plan_edit_scope_check() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_work_plan_edit_scope_check ON app.v2_work_plan_edit;
  -- AFTER, so the firm's row-level security check refuses an outsider first.
  CREATE TRIGGER v2_work_plan_edit_scope_check AFTER INSERT ON app.v2_work_plan_edit
    FOR EACH ROW EXECUTE FUNCTION app.v2_work_plan_edit_scope_check();
END
$v2$;
COMMIT;
