BEGIN;
-- Bind guided runs to real command-owned subjects, never seed a trial or restore keys.
CREATE TABLE app.demo_trial_binding (
 tenant_id uuid NOT NULL, run_id uuid NOT NULL, first_job_id uuid NOT NULL, second_job_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,run_id), CHECK(first_job_id<>second_job_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES app.small_builder_demo_run(tenant_id,id),
 FOREIGN KEY(tenant_id,first_job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,second_job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.demo_trial_binding OWNER TO jobguard_migration;
ALTER TABLE app.demo_trial_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.demo_trial_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.demo_trial_binding TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.demo_trial_binding FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.demo_trial_binding FOR EACH ROW EXECUTE FUNCTION app.small_builder_demo_guard();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.demo_trial_binding FOR EACH STATEMENT EXECUTE FUNCTION app.small_builder_demo_guard();

CREATE FUNCTION app.demo_trial(t uuid,digest text,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; r app.small_builder_demo_run; b app.demo_trial_binding; parent app.demo_trial_binding;
 action text:=v->>'action'; command uuid; result jsonb; prior app.small_builder_demo_receipt;
 first_source jsonb; second_source jsonb; subscription jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'DEMO_SYNTHETIC_ONLY'; END IF;
 actor:=app.mon3_owner(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,313));
 actor:=app.mon3_owner(t,digest);
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v->>'version' IS DISTINCT FROM 'trial-demo-command.v1'
 OR action IS NULL OR action NOT IN('bind','read','snapshot','report') OR NOT v ? 'runId' THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
 IF v-(CASE action WHEN 'bind' THEN ARRAY['version','action','runId','commandId','firstJobId','secondJobId']
 WHEN 'snapshot' THEN ARRAY['version','action','runId','commandId'] WHEN 'report' THEN ARRAY['version','action','runId','snapshotId'] ELSE ARRAY['version','action','runId'] END)<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
 SELECT * INTO r FROM app.small_builder_demo_run WHERE tenant_id=t AND id=(v->>'runId')::uuid AND owner_membership_id=actor AND scenario='trial';
 IF r.id IS NULL THEN RAISE EXCEPTION 'DEMO_NOT_FOUND'; END IF;
 SELECT * INTO b FROM app.demo_trial_binding WHERE tenant_id=t AND run_id=r.id;
 IF action='report' THEN
  SELECT receipt.result INTO result FROM app.small_builder_demo_receipt receipt WHERE tenant_id=t AND run_id=r.id AND owner_membership_id=actor
   AND command_id=(v->>'snapshotId')::uuid AND request->>'action'='snapshot' AND receipt.result->>'version'='trial-demo-report.v1';
  IF result IS NULL THEN RAISE EXCEPTION 'DEMO_NOT_FOUND'; END IF;
  RETURN result;
 END IF;
 IF action IN('bind','snapshot') THEN
  command:=(v->>'commandId')::uuid;
  IF command IS NULL THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
  SELECT * INTO prior FROM app.small_builder_demo_receipt WHERE tenant_id=t AND command_id=command;
  IF prior.command_id IS NOT NULL THEN
   IF prior.owner_membership_id<>actor OR prior.run_id<>r.id OR prior.request<>v THEN RAISE EXCEPTION 'DEMO_COMMAND_CONFLICT'; END IF;
   RETURN prior.result;
  END IF;
  IF r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'DEMO_ARCHIVED'; END IF;
 END IF;
 IF action='bind' THEN
  IF b.run_id IS NOT NULL THEN RAISE EXCEPTION 'DEMO_COMMAND_CONFLICT'; END IF;
  IF v->>'firstJobId' IS NULL OR v->>'secondJobId' IS NULL OR v->>'firstJobId'=v->>'secondJobId' THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
  -- A reset continues the exact same domain subjects, including their consumed identity.
  IF r.predecessor_id IS NOT NULL THEN
   -- An unbound reset is still usable; skipping an unbound generation cannot discard an older binding.
   WITH RECURSIVE ancestors AS (
    SELECT id,predecessor_id,1 depth FROM app.small_builder_demo_run WHERE tenant_id=t AND id=r.predecessor_id AND owner_membership_id=actor
    UNION ALL
    SELECT p.id,p.predecessor_id,a.depth+1 FROM app.small_builder_demo_run p JOIN ancestors a ON p.id=a.predecessor_id WHERE p.tenant_id=t AND p.owner_membership_id=actor
   ) SELECT binding.* INTO parent FROM app.demo_trial_binding binding JOIN ancestors a ON binding.run_id=a.id WHERE binding.tenant_id=t ORDER BY a.depth LIMIT 1;
   IF parent.run_id IS NOT NULL AND (parent.first_job_id<>(v->>'firstJobId')::uuid OR parent.second_job_id<>(v->>'secondJobId')::uuid) THEN RAISE EXCEPTION 'DEMO_COMMAND_CONFLICT'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM app.trial_start WHERE tenant_id=t AND job_id<>(v->>'firstJobId')::uuid) THEN RAISE EXCEPTION 'DEMO_COMMAND_CONFLICT'; END IF;
  -- Public readers enforce company ownership and exclude practice-cookie jobs.
  PERFORM app.mon3_read_lifecycle(t,digest,(v->>'firstJobId')::uuid);
  PERFORM app.mon3_read_lifecycle(t,digest,(v->>'secondJobId')::uuid);
  INSERT INTO app.demo_trial_binding VALUES(t,r.id,(v->>'firstJobId')::uuid,(v->>'secondJobId')::uuid) RETURNING * INTO b;
 END IF;
 IF b.run_id IS NULL THEN RAISE EXCEPTION 'DEMO_NOT_FOUND'; END IF;
 first_source:=app.mon3_read_lifecycle(t,digest,b.first_job_id);
 second_source:=app.mon3_read_lifecycle(t,digest,b.second_job_id);
 subscription:=app.mon2_read(t,digest);
 -- Recheck after all producers; no caller facts, clock, terms or balances are accepted.
 PERFORM app.mon3_owner(t,digest);
 result:=jsonb_build_object('version','trial-demo-report.v1','environment','synthetic_demo','runId',r.id,
  'archived',r.archived_at IS NOT NULL,'snapshotId',command,'first',first_source,'second',second_source,
  'firstEligibility',app.mon3_read_eligibility(t,digest,b.first_job_id),'secondEligibility',app.mon3_read_eligibility(t,digest,b.second_job_id),'subscription',subscription);
 IF command IS NOT NULL THEN
  INSERT INTO app.small_builder_demo_receipt(tenant_id,command_id,run_id,owner_membership_id,request,result) VALUES(t,command,r.id,actor,v,result);
  PERFORM app.small_builder_demo_audit(t,actor,command,'trial_'||action,app.final_lock_hash(v),app.final_lock_hash(result));
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.demo_trial(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.demo_trial(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.demo_trial(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
