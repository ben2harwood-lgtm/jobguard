BEGIN;
-- LATER-SAFETY-79: synthetic owner/admin recovery only. Ordinary completion and
-- EndCheck stay unchanged. No feature gate: cleanup must survive lost access.
CREATE FUNCTION app.ent3b_close_abandoned_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_reason text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; visit_row app.site_visit; prior app.command_receipt;
 answer_id uuid:=gen_random_uuid(); recorded timestamptz; request_hash text;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR NOT coalesce(app.contractor_member_active(p_actor),false)
  OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=tenant AND m.id=p_actor AND m.role IN('owner','admin'))
  OR NOT coalesce(app.contractor_allowed(p_actor,'organisation.manage',app.contractor_job_team(p_job)),false)
 THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR p_job IS NULL OR p_visit IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_actor,p_job,p_visit,p_reason)::text,'UTF8')),'hex');
 -- Same command namespace as contractor commands. Current authority precedes replay.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_command::text,8189));
 SELECT * INTO prior FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command;
 IF prior.command_id IS NOT NULL THEN
  IF prior.command_type<>'CloseAbandonedSiteVisit' OR prior.actor_membership_id<>p_actor
   OR prior.request_hash<>request_hash OR prior.status<>'succeeded' THEN
   RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN (prior.result->>'answerId')::uuid;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=tenant AND id=p_job FOR SHARE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_visit::text,3102));
 SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=tenant AND v.id=p_visit AND v.job_id=p_job;
 IF visit_row.id IS NULL OR visit_row.completed_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.ent3b_visit_authority(visit_row.membership_id,p_job) a WHERE a.decision='allowed') THEN
  RAISE EXCEPTION 'VISIT_NOT_ABANDONED' USING ERRCODE='55000'; END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(tenant,p_command,'CloseAbandonedSiteVisit','abandoned-visit:'||p_visit::text,request_hash,'processing',p_actor);
 recorded:=pg_catalog.clock_timestamp();
 UPDATE app.site_visit SET completed_at=recorded WHERE tenant_id=tenant AND id=p_visit;
 -- Preserve the visit member, question version, one-answer invariant and server time.
 -- This administrative 'no' is distinguished from an operative answer by its receipt/audit.
 INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at)
 VALUES(tenant,answer_id,p_job,visit_row.work_order_id,p_visit,visit_row.membership_id,'closeout-question.v1','no',p_command,recorded);
 UPDATE app.command_receipt SET status='succeeded',result=jsonb_build_object('answerId',answer_id),completed_at=recorded
 WHERE tenant_id=tenant AND command_id=p_command;
 -- Last contending lock is the audit head. Never put free-text reasons in audit.
 PERFORM app.append_audit(jsonb_build_array(jsonb_build_object('id',answer_id,'version','audit.v1',
  'actorRef','membership:'||p_actor::text,'eventType','contractor.visit.completed','subjectType','site-visit','subjectRef',p_visit::text,
  'payload',jsonb_build_object('references',jsonb_build_object('command',p_command::text,'job',p_job::text,'visit',p_visit::text,
   'closeoutAnswer',answer_id::text,'closeKind','abandoned','environment','synthetic_demo'),
   'hashes',jsonb_build_object('reason',encode(sha256(convert_to(p_reason,'UTF8')),'hex'))))));
 RETURN answer_id;
END $$;
ALTER FUNCTION app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text) TO jobguard_runtime;

-- Latest body: site_visit_closeout. Keep the normal command branch intact;
-- only the administrative receipt may use a different actor and must answer no.
CREATE OR REPLACE FUNCTION app.ent3b_closeout_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.site_visit v WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.site_visit_id AND v.job_id=NEW.job_id AND v.work_order_id=NEW.work_order_id AND v.membership_id=NEW.membership_id AND v.completed_at=NEW.server_recorded_at)
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.status='processing'
   AND ((r.command_type='CompleteSiteVisit' AND r.actor_membership_id=NEW.membership_id)
    OR (r.command_type='CloseAbandonedSiteVisit' AND NEW.answer='no'
     AND coalesce(app.contractor_member_active(r.actor_membership_id),false)
     AND EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=r.actor_membership_id AND m.role IN('owner','admin'))
     AND coalesce(app.contractor_allowed(r.actor_membership_id,'organisation.manage',app.contractor_job_team(NEW.job_id)),false))))
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
