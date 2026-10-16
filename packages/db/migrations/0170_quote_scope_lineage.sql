-- SERIOUS-B3 S09: a scope revision must belong to the exact tenant/job/item named by its commercial source.
-- Validate existing rows without rewriting immutable commercial history. Inconsistent history blocks installation.
BEGIN;
ALTER TABLE app.scope_revision ADD CONSTRAINT scope_revision_item_source_uq UNIQUE(tenant_id,job_id,scope_item_id,id);
ALTER TABLE app.quote_line ADD CONSTRAINT quote_line_item_source_fk
  FOREIGN KEY(tenant_id,job_id,scope_item_id,scope_revision_id)
  REFERENCES app.scope_revision(tenant_id,job_id,scope_item_id,id);
ALTER TABLE app.rate_book_observation ADD CONSTRAINT rate_observation_item_source_fk
  FOREIGN KEY(tenant_id,job_id,scope_item_id,source_scope_revision_id)
  REFERENCES app.scope_revision(tenant_id,job_id,scope_item_id,id);
COMMIT;
