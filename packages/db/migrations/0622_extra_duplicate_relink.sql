-- ENT-3-RELINK-FIX. Forward repair; immutable links/events and approval outcomes are preserved.
BEGIN;

CREATE OR REPLACE FUNCTION app.xa_latest_kind(p_tenant uuid, p_job uuid, p_variation uuid) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT e.kind FROM app.extra_event e
 WHERE(e.tenant_id,e.job_id,e.variation_id)=(p_tenant,p_job,p_variation)
 -- Only the duplicate event written by this exact reversed link is superseded.
 -- Active links, unrelated events and all approval outcomes retain their meaning.
 AND (e.kind<>'duplicate' OR NOT EXISTS(
  SELECT 1 FROM app.extra_duplicate_link l
  JOIN app.extra_duplicate_link u ON(u.tenant_id,u.job_id,u.reverses_link_id)=(l.tenant_id,l.job_id,l.id) AND u.kind='unlink'
  WHERE(l.tenant_id,l.job_id,l.duplicate_id,l.command_id)=(e.tenant_id,e.job_id,e.variation_id,e.command_id) AND l.kind='link'
 ))
 ORDER BY e.sequence DESC LIMIT 1
$$;

-- Latest writer body: 0522_lp5b_writers.sql, including its private LP-5 effect handoff.
CREATE OR REPLACE FUNCTION app.xa_mark_duplicate(p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['MarkDuplicate'],p_actor);
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_duplicate=p_canonical OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_duplicate) AND x.job_track='contractor')
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_canonical) AND x.job_track='contractor') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Read the effective state: an explicitly reversed duplicate fact no longer masks the prior state.
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_duplicate);
 IF v_latest IS NULL OR v_latest NOT IN('logged','awaiting_approval','approved','rejected') OR app.xa_latest_kind(v_tenant,p_job,p_canonical) IN('withdrawn','duplicate') THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,command_id,actor_membership_id) VALUES(v_tenant,p_link,p_job,p_duplicate,p_canonical,'link',p_command,p_actor);
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_duplicate ORDER BY q.request_revision DESC LIMIT 1;
 IF v_req.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id)) THEN
  SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,p_duplicate,v_req.id,'duplicate','member',p_actor,p_command);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_n,'dismissed',p_actor);
 END IF;
 PERFORM app.xa_event(v_tenant,p_job,p_duplicate,'duplicate',NULL,NULL,p_command,p_actor);
 lp5_result:=jsonb_build_object('linkId',p_link,'variationId',p_duplicate); PERFORM app.lp5_bind_effect(p_command,NULL,'contractor_extra',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;

COMMIT;
