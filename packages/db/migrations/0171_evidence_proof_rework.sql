BEGIN;
-- A completed stage keeps its identity and original receipt. Rework appends one
-- successor for the same tenant/job/scope/stage; old rows remain unchanged roots.
ALTER TABLE app.stage_completion ADD COLUMN supersedes_completion_id uuid;
ALTER TABLE app.stage_completion DROP CONSTRAINT stage_completion_tenant_id_job_id_scope_item_id_stage_key;
ALTER TABLE app.stage_completion ADD CONSTRAINT stage_completion_revision_identity UNIQUE(tenant_id,job_id,scope_item_id,stage,id);
ALTER TABLE app.stage_completion ADD CONSTRAINT stage_completion_predecessor_fk
 FOREIGN KEY(tenant_id,job_id,scope_item_id,stage,supersedes_completion_id)
 REFERENCES app.stage_completion(tenant_id,job_id,scope_item_id,stage,id);
ALTER TABLE app.stage_completion ADD CONSTRAINT stage_completion_not_self CHECK(supersedes_completion_id IS DISTINCT FROM id);
CREATE UNIQUE INDEX stage_completion_one_root ON app.stage_completion(tenant_id,job_id,scope_item_id,stage) WHERE supersedes_completion_id IS NULL;
CREATE UNIQUE INDEX stage_completion_one_successor ON app.stage_completion(tenant_id,supersedes_completion_id) WHERE supersedes_completion_id IS NOT NULL;

-- Same ownership rule as practiceOwnedJobsSql: adoption inherits only the source
-- session through the immutable adoption audit event, recursively. Preserve the
-- legacy unscoped synthetic fixture path when both digests are null.
CREATE OR REPLACE FUNCTION app.guard_practice_material_requirement() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND NOT EXISTS(
  WITH RECURSIVE owned(id) AS (
   SELECT id FROM app.job WHERE tenant_id=NEW.tenant_id AND practice_session_digest IS NOT DISTINCT FROM nullif(current_setting('app.practice_material_digest',true),'')
   UNION
   SELECT j.id FROM owned source JOIN app.audit_event e ON e.tenant_id=NEW.tenant_id
    AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested'
    AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job j ON j.tenant_id=e.tenant_id AND j.id::text=e.subject_ref
    AND j.provenance='imported' AND j.practice_session_digest IS NULL
  )
  SELECT 1 FROM owned JOIN app.merchant_sku s ON s.tenant_id=NEW.tenant_id
   WHERE owned.id=NEW.job_id AND s.id=NEW.sku_id
    AND s.practice_session_digest IS NOT DISTINCT FROM nullif(current_setting('app.practice_material_digest',true),'')
 ) THEN RAISE EXCEPTION 'PRACTICE_MATERIAL_NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
COMMIT;
