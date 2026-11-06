BEGIN;
-- Reviews and approvals are immutable; no supersession command currently exists.
-- New reviews may be recorded, but cannot create another standing approval for the same line.
CREATE UNIQUE INDEX billability_one_line_approval ON app.recovery_billability_command
 (tenant_id,job_id,case_id,(payload->>'workId'),(payload->>'lineId')) WHERE action='approve';
COMMIT;
