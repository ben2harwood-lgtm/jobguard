BEGIN;
-- Existing append-only RLS tables, grants and policies are unchanged. No new business table.
ALTER TABLE app.supplier_document_intake DROP CONSTRAINT supplier_document_intake_channel_check;
ALTER TABLE app.supplier_document_intake ADD CONSTRAINT supplier_document_intake_channel_check
  CHECK(channel IN ('picker','fixture_mail','fixture_portal'));
ALTER TABLE app.supplier_document_intake ADD COLUMN source_schema_version varchar(80);
-- Arrival metadata stays off supplier_document: evidence packs fingerprint its whole row.
ALTER TABLE app.supplier_document_intake ADD COLUMN canonical_document_id uuid;
-- The non-superuser migration owner must validate the FK across both FORCE-RLS
-- tables without tenant context. ALTER locks are held through COMMIT; runtime
-- cannot observe the temporary owner-only bypass. Restore FORCE immediately.
ALTER TABLE app.supplier_document_intake NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.supplier_document NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.supplier_document_intake ADD CONSTRAINT merchant_canonical_document_fk
  FOREIGN KEY(tenant_id,job_id,canonical_document_id) REFERENCES app.supplier_document(tenant_id,job_id,id);
ALTER TABLE app.supplier_document FORCE ROW LEVEL SECURITY;
ALTER TABLE app.supplier_document_intake FORCE ROW LEVEL SECURITY;
ALTER TABLE app.supplier_document_intake ADD CONSTRAINT merchant_canonical_document_held
  CHECK(canonical_document_id IS NULL OR (result='held' AND canonical_document_id<>document_id));
COMMIT;
