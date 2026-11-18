BEGIN;
-- LATER-SAFETY-189: new statements describe only the raising operative's own decision.
-- Covered history and all existing facts remain unchanged; forward-fix only.
CREATE OR REPLACE FUNCTION app.xa_proceed(p_job uuid,p_extra uuid,p_actor uuid,p_body jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 cmd uuid; claim jsonb; content jsonb; q app.extra_approval_request; reporter boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 reporter:=EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=p_actor AND m.role='operative')
  AND EXISTS(SELECT 1 FROM app.ent3a_extra_authority(p_actor,'LogSiteExtra',p_job) WHERE decision='allowed');
 IF NOT reporter AND (p_body IS NOT NULL OR app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NULL) THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.ent3a_require_extra_authority(p_job,p_extra);
 IF p_body IS NULL THEN RETURN app.xa_proceed_view(p_job,p_extra); END IF;
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin o WHERE o.tenant_id=t AND o.job_id=p_job
  AND o.variation_id=p_extra AND o.raising_membership_id=p_actor) THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object'
  OR (p_body-ARRAY['version','commandId','requestId','reason'])<>'{}'
  OR NOT(p_body ?& ARRAY['version','commandId','requestId','reason'])
  OR p_body->>'version' IS DISTINCT FROM 'record-extra-proceed.v1'
  OR jsonb_typeof(p_body->'reason') IS DISTINCT FROM 'string'
  OR length(btrim(p_body->>'reason')) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 cmd:=(p_body->>'commandId')::uuid;
 IF cmd IS NULL OR (p_body->>'requestId')::uuid IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 content:=p_body||jsonb_build_object('jobId',p_job,'extraId',p_extra);
 claim:=app.begin_command('repository-command.v1',cmd,'RecordExtraProceed','extra-proceed:'||p_job::text||':'||cmd::text,
  jsonb_build_object('tenantId',t,'actorMembershipId',p_actor,'subjectType','job','subjectRef',p_job),'{}'::jsonb,
  jsonb_build_object('version','repository-command.v1','actorMembershipId',p_actor,'input',content,'legacyJson',content::text));
 IF claim->>'kind'='replay' THEN RETURN claim->'result'; END IF;
 SELECT * INTO q FROM app.extra_approval_request WHERE tenant_id=t AND job_id=p_job AND variation_id=p_extra AND id=(p_body->>'requestId')::uuid;
 IF q.id IS NULL OR q.net_pence IS NULL OR q.binding_id IS NULL
  OR EXISTS(SELECT 1 FROM app.extra_approval_request n WHERE(n.tenant_id,n.variation_id)=(t,p_extra) AND n.request_revision>q.request_revision)
  OR EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(t,q.id)) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_proceed_statement(tenant_id,id,command_id,job_id,variation_id,request_id,actor_membership_id,reason)
 VALUES(t,gen_random_uuid(),cmd,p_job,p_extra,q.id,p_actor,btrim(p_body->>'reason'));
 -- Completion verifies the fact and appends command.succeeded last, atomically.
 RETURN app.complete_command(cmd,'{}'::jsonb);
END $$;
ALTER FUNCTION app.xa_proceed(uuid,uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xa_proceed(uuid,uuid,uuid,jsonb) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xa_proceed(uuid,uuid,uuid,jsonb) TO jobguard_runtime;
COMMIT;
