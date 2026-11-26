BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  ALTER TABLE app.v2_brief_progress DROP CONSTRAINT IF EXISTS v2_brief_progress_photo_reference_check;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='app.v2_brief_progress'::regclass
    AND conname='v2_brief_progress_photo_fk') THEN
    ALTER TABLE app.v2_brief_progress ADD CONSTRAINT v2_brief_progress_photo_fk
      FOREIGN KEY (tenant_id,photo_reference) REFERENCES app.evidence_upload(tenant_id,id);
  END IF;
  -- Invoker rights: the visible same-job upload must exist, even inside one tenant.
  CREATE OR REPLACE FUNCTION app.v2_progress_photo_guard() RETURNS trigger
    LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $guard$
  BEGIN
    IF NEW.photo_reference IS NOT NULL AND NOT EXISTS (
      SELECT FROM app.evidence_upload u
      WHERE (u.tenant_id,u.job_id,u.id)=(NEW.tenant_id,NEW.job_id,NEW.photo_reference)
    ) THEN RAISE EXCEPTION 'V2_PROGRESS_PHOTO_OTHER_JOB' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $guard$;
  REVOKE ALL ON FUNCTION app.v2_progress_photo_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_progress_photo ON app.v2_brief_progress;
  CREATE TRIGGER v2_progress_photo BEFORE INSERT ON app.v2_brief_progress
    FOR EACH ROW EXECUTE FUNCTION app.v2_progress_photo_guard();
END $v2$;
COMMIT;
