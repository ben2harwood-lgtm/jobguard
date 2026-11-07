BEGIN;
-- Company authority is freshly proved by ch5_import_actor above the import check.
-- Only shared practice imports remain bound to the adopting session digest.
CREATE OR REPLACE FUNCTION app.ch5_history_actor(t uuid,j uuid,d text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 ELSE actor:=app.ch5_import_actor(t,d); END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job_import_v3 i JOIN app.job_commercial_track c
  ON(c.tenant_id,c.job_id)=(i.tenant_id,i.job_id)
  WHERE i.tenant_id=t AND i.job_id=j AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR i.session_digest=d) AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.ch5_history_actor(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_history_actor(uuid,uuid,text) FROM PUBLIC,jobguard_runtime;
COMMIT;
