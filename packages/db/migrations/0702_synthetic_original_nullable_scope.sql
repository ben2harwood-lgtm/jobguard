BEGIN;
ALTER TABLE app.synthetic_evidence_original ALTER COLUMN scope_item_id DROP NOT NULL;
COMMIT;
