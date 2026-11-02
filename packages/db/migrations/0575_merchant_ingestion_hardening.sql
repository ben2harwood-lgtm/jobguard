BEGIN;
-- Existing append-only RLS tables, grants and policies are unchanged. No new business table.
ALTER TABLE app.supplier_document_intake DROP CONSTRAINT supplier_document_intake_channel_check;
ALTER TABLE app.supplier_document_intake ADD CONSTRAINT supplier_document_intake_channel_check
  CHECK(channel IN ('picker','fixture_mail','fixture_portal'));
ALTER TABLE app.supplier_document_intake ADD COLUMN source_schema_version varchar(80);
-- Follow the existing migration convention for owner-side FK validation under FORCE RLS.
-- ALTER holds ACCESS EXCLUSIVE until commit; runtime never sees the temporary owner-only bypass.
ALTER TABLE app.supplier_document NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.supplier_document ADD COLUMN canonical_document_id uuid;
ALTER TABLE app.supplier_document ADD CONSTRAINT merchant_canonical_document_fk
  FOREIGN KEY(tenant_id,job_id,canonical_document_id) REFERENCES app.supplier_document(tenant_id,job_id,id);
ALTER TABLE app.supplier_document ADD CONSTRAINT merchant_canonical_document_held
  CHECK(canonical_document_id IS NULL OR (status='held' AND canonical_document_id<>id));
ALTER TABLE app.supplier_document FORCE ROW LEVEL SECURITY;
COMMIT;
