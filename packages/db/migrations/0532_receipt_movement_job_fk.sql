BEGIN;
-- receipt-movement-job-fk: 0386 already installed the job-bound FK, but removed
-- 0258's tenant-only FK. Restore that original constraint and retain both.
ALTER TABLE app.receipt_allocation_fact_source
 ADD CONSTRAINT receipt_allocation_fact_source_tenant_id_movement_id_fkey
 FOREIGN KEY(tenant_id,movement_id)
 REFERENCES app.practice_feed_event(tenant_id,id) NOT VALID;
ALTER TABLE app.receipt_allocation_fact_source
 DROP CONSTRAINT receipt_fact_source_job_movement_fk;
ALTER TABLE app.receipt_allocation_fact_source
 ADD CONSTRAINT receipt_fact_source_job_movement_fk
 FOREIGN KEY(tenant_id,job_id,movement_id)
 REFERENCES app.practice_feed_event(tenant_id,job_id,id) NOT VALID;
-- Check every historical row; mismatches abort atomically, never rewrite facts.
ALTER TABLE app.receipt_allocation_fact_source
 VALIDATE CONSTRAINT receipt_allocation_fact_source_tenant_id_movement_id_fkey;
ALTER TABLE app.receipt_allocation_fact_source
 VALIDATE CONSTRAINT receipt_fact_source_job_movement_fk;
COMMIT;
