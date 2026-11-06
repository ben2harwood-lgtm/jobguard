BEGIN;
-- ENT-5 Q04: preserve cross-revision separation; allow the same slot on a new request.
CREATE OR REPLACE FUNCTION app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_origin app.extra_origin; v_n integer; v_step jsonb; v_roles text[]; v_grant uuid; v_prior record; v_rev uuid; v_total integer; v_final boolean;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_reject THEN 'RejectExtra' ELSE 'ApproveExtraStep' END],p_actor);
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,v_req.variation_id);
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR app.xa_latest_kind(v_tenant,p_job,v_req.variation_id) IS DISTINCT FROM 'awaiting_approval' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 IF v_req.revision_hash::text IS DISTINCT FROM p_hash OR v_req.net_pence IS DISTINCT FROM p_net THEN RAISE EXCEPTION 'HASH_MISMATCH' USING ERRCODE='23514'; END IF;
 IF v_req.net_pence IS NULL THEN RAISE EXCEPTION 'UNPRICED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF p_step IS DISTINCT FROM v_n THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 v_total:=jsonb_array_length(v_req.requirement->'steps'); v_step:=v_req.requirement->'steps'->v_n;
 IF v_step IS NULL OR v_step->>'kind'<>'human' THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF v_step->>'role'='client_approver' THEN RAISE EXCEPTION 'CLIENT_STEP_REQUIRES_CLIENT' USING ERRCODE='23514'; END IF;
 v_roles:=ARRAY[v_step->>'role'];
 IF EXISTS(SELECT 1 FROM app.extra_escalation_fact e WHERE(e.tenant_id,e.request_id,e.step_index)=(v_tenant,p_request,v_n)) THEN
  v_roles:=v_roles||(v_step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles'));
 END IF;
 v_grant:=app.xa_covers(p_actor,v_roles,p_job,'extra.approve');
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_actor=v_origin.raising_membership_id THEN RAISE EXCEPTION 'SELF_APPROVAL' USING ERRCODE='23514'; END IF;
 -- Rejection occupies a step too, even though it is an outcome rather than an approval fact.
 SELECT h.step_index,h.request_id INTO v_prior FROM (
  SELECT f.step_index,f.request_id FROM app.extra_approval_step_fact f
   WHERE f.tenant_id=v_tenant AND f.variation_id=v_req.variation_id AND f.actor_membership_id=p_actor
  UNION ALL
  SELECT (r.result->>'stepIndex')::integer,o.request_id FROM app.extra_approval_outcome o
   JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(o.tenant_id,o.command_id)
   WHERE o.tenant_id=v_tenant AND o.variation_id=v_req.variation_id AND o.actor_membership_id=p_actor
    AND o.kind='rejected' AND r.status='succeeded'
 ) h ORDER BY (h.step_index<>v_n) DESC,h.step_index LIMIT 1;
 IF v_prior.request_id IS NOT NULL THEN
  IF v_prior.step_index<>v_n THEN RAISE EXCEPTION 'REUSED_APPROVER' USING ERRCODE='23514'; END IF;
  -- Same person may approve the same slot of a new request revision.
  -- Same-request repeats are resolved by the durable command receipt before this routine.
 END IF;
 SELECT b.variation_revision_id INTO v_rev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.id)=(v_tenant,v_req.binding_id);
 IF p_reject THEN
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'rejected',p_reason,'member',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'rejected',v_rev,p_reason,p_command,p_actor);
  PERFORM app.xa_resolve_decision(v_tenant,p_request,v_n,'rejected',p_actor);
  lp5_result:=jsonb_build_object('requestId',p_request,'state','rejected','stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,actor_membership_id,grant_id,approved_hash,approved_net_pence,command_id)
 VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,v_n,v_step->>'role','member',p_actor,v_grant,v_req.revision_hash,v_req.net_pence,p_command);
 PERFORM app.xa_resolve_decision(v_tenant,p_request,v_n,'approved',p_actor);
 v_final:=v_n+1=v_total;
 IF v_final THEN
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'approved','member',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'approved',v_rev,NULL,p_command,p_actor);
 ELSIF v_req.requirement->'steps'->(v_n+1)->>'role'<>'client_approver' THEN PERFORM app.xa_open_decision(v_tenant,p_request,v_n+1); END IF;
 lp5_result:=jsonb_build_object('requestId',p_request,'state',CASE WHEN v_final THEN 'approved' ELSE 'awaiting_approval' END,'stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;
COMMIT;
