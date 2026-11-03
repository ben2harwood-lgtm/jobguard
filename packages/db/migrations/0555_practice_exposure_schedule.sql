BEGIN;
SET LOCAL ROLE jobguard_migration;

-- MON-7: append-only operational forecasts for practice jobs. No financial grants.
CREATE TABLE app.practice_exposure_schedule (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision > 0),
 command_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 stages jsonb NOT NULL CHECK(jsonb_typeof(stages)='array' AND jsonb_array_length(stages) BETWEEN 1 AND 1000),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT exposure_schedule_pk PRIMARY KEY(tenant_id,job_id,revision),
 CONSTRAINT exposure_schedule_command_key UNIQUE(tenant_id,command_id),
 CONSTRAINT exposure_schedule_job_fk FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.practice_exposure_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.practice_exposure_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.practice_exposure_schedule FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.practice_exposure_schedule FROM PUBLIC,jobguard_runtime;
GRANT SELECT,INSERT ON app.practice_exposure_schedule TO jobguard_runtime;
CREATE TRIGGER exposure_immutable BEFORE UPDATE OR DELETE ON app.practice_exposure_schedule
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
COMMIT;
