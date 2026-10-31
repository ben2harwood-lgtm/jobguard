BEGIN;
-- M4-8-S F5/F7: a settled movement belongs to the same job as its allocation.
-- 0119 already supplies practice_feed_event_job_identity; validate all stored
-- rows now. A historical mismatch must fail the migration, never be relabelled.
ALTER TABLE app.receipt_allocation_fact_source
 ADD CONSTRAINT receipt_fact_source_job_movement_fk
 FOREIGN KEY(tenant_id,job_id,movement_id)
 REFERENCES app.practice_feed_event(tenant_id,job_id,id);
ALTER TABLE app.receipt_allocation_fact_source
 DROP CONSTRAINT receipt_allocation_fact_source_tenant_id_movement_id_fkey;
COMMIT;
