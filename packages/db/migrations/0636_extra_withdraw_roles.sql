BEGIN;
-- ENT-5 Q11: both first execution and receipt replay use the expanded covered roles.
CREATE OR REPLACE FUNCTION app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_open boolean; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['WithdrawExtra'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation) AND x.job_track='contractor' AND x.provenance='command') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- ENT-5 Q11, 4 Nov: covered supervisor, surveyor or commercial manager before final outcome.
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN('not_done','raised_in_error','resident_cancelled','already_on_order') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 -- Withdrawing is withdrawing the request: once it is approved the extra stays approved (so an approve that wins a race is the one effect).
 IF v_latest IS NULL OR v_latest NOT IN('logged','awaiting_approval') THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 v_open:=v_req.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
 IF v_open THEN
  SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,v_req.id,'withdrawn',p_reason,'member',p_actor,p_command);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_n,'dismissed',p_actor);
 END IF;
 PERFORM app.xa_event(v_tenant,p_job,p_variation,'withdrawn',NULL,p_reason,p_command,p_actor);
 lp5_result:=jsonb_build_object('variationId',p_variation,'state','withdrawn','requestId',v_req.id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;
CREATE OR REPLACE FUNCTION app.lp5b_contractor_permission(p_type text,p_actor uuid,p_job uuid,p_input jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 v jsonb:=(CASE WHEN (p_input ? 'content') THEN (p_input->'content') ELSE p_input END);
 role_name text; allowed boolean; roles text[]; step jsonb; req app.extra_approval_request;
BEGIN
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT role INTO role_name FROM app.membership WHERE tenant_id=t AND id=p_actor;
 IF (v->>'jobId')::uuid IS DISTINCT FROM p_job
  OR ((p_input ? 'actor') AND (p_input->>'actor')::uuid IS DISTINCT FROM p_actor)
  OR ((p_input ? 'actorMembershipId') AND (p_input->>'actorMembershipId')::uuid IS DISTINCT FROM p_actor)
  OR ((p_input ? 'membershipId') AND (p_input->>'membershipId')::uuid IS DISTINCT FROM p_actor) THEN
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_type IN('StartSiteVisit','CompleteSiteVisit') THEN
  SELECT count(*)=1 AND bool_and(decision='allowed' AND reason_code='allowed') INTO allowed
   FROM app.ent3b_visit_authority(p_actor,p_job);
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_type='CompleteSiteVisit' AND NOT EXISTS(SELECT 1 FROM app.site_visit
   WHERE tenant_id=t AND id=(v->>'visitId')::uuid AND job_id=p_job AND membership_id=p_actor) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN;
 END IF;
 -- The lower-level ExtraRepository retains its original provenance rule. Its
 -- public SiteExtra caller adds ENT-3a role/live/assignment/evidence checks.
 IF NOT(p_input ? 'content') THEN
  IF p_type='ConfirmPrompt' THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
  IF p_type IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction') AND (v ? 'grantId') THEN
   SELECT EXISTS(SELECT 1 FROM app.role_grant g
    JOIN app.team team ON team.tenant_id=t AND team.id=app.contractor_job_team(p_job)
    JOIN app.org_unit branch ON(branch.tenant_id,branch.id)=(team.tenant_id,team.branch_id)
    WHERE g.tenant_id=t AND g.id=(v->>'grantId')::uuid AND g.membership_id=p_actor AND g.role=role_name
     AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
     AND ((g.scope_kind='tenant' AND g.scope_id=t) OR (g.scope_kind='team' AND g.scope_id=team.id)
      OR (g.scope_kind='branch' AND g.scope_id=branch.id) OR (g.scope_kind='region' AND g.scope_id=branch.parent_id))) INTO allowed;
   IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
   RETURN;
  ELSIF p_type IN('MarkDuplicate','RecordClientInstruction') THEN
   -- These existing low-level link primitives have tenant/member authority;
   -- their structural graph/order guards remain authoritative at mutation.
   RETURN;
  ELSIF p_type='UnlinkDuplicate' THEN
   IF NOT coalesce(app.contractor_job_allowed(p_actor,'organisation.manage',p_job)
     OR app.contractor_job_allowed(p_actor,'extra.price',p_job),false) THEN
    RAISE EXCEPTION 'UNLINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
   RETURN;
  END IF;
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END IF;
 IF (p_input->>'type') IS DISTINCT FROM p_type THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 CASE p_type
 WHEN 'SubmitExtra' THEN
  allowed:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor'],p_job,'job.read') IS NOT NULL
   OR (role_name='operative' AND EXISTS(SELECT 1 FROM app.extra_origin o JOIN app.extra_sor_revision s
    ON(s.tenant_id,s.job_id,s.variation_id)=(o.tenant_id,o.job_id,o.variation_id)
    WHERE o.tenant_id=t AND o.job_id=p_job AND o.variation_id=(v->>'extraId')::uuid AND o.raising_membership_id=p_actor)
    AND coalesce(app.contractor_job_allowed(p_actor,'extra.log',p_job),false));
 WHEN 'PriceExtra','ReviseExtra' THEN allowed:=app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NOT NULL;
 WHEN 'WithdrawExtra' THEN allowed:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NOT NULL;
 WHEN 'MarkDuplicate' THEN allowed:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NOT NULL;
 WHEN 'RevokeClientApproval' THEN allowed:=role_name='owner';
 WHEN 'ApproveExtraStep','RejectExtra' THEN
  SELECT * INTO req FROM app.extra_approval_request WHERE tenant_id=t AND job_id=p_job AND id=(v->>'requestId')::uuid;
  IF req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  step:=(req.requirement->'steps')->(v->>'stepIndex')::integer;
  -- Replay uses the original step, not the current next-step count. Transition
  -- checks (already decided/self/separation) still belong to xa_approve.
  roles:=ARRAY[(step->>'role')];
  IF EXISTS(SELECT 1 FROM app.extra_escalation_fact WHERE tenant_id=t AND request_id=req.id AND step_index=(v->>'stepIndex')::integer) THEN
   roles:=roles||(step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(step->'alternateRoles')); END IF;
  allowed:=(step->>'kind')='human' AND (step->>'role')<>'client_approver'
   AND app.xa_covers(p_actor,roles,p_job,'extra.approve') IS NOT NULL;
 WHEN 'ClientDecideExtra' THEN
  PERFORM app.xa_client_view_authority(p_job,(v->>'requestId')::uuid,p_actor,(v->>'email'));
  IF NOT EXISTS(SELECT 1 FROM app.extra_client_link WHERE tenant_id=t AND job_id=p_job
   AND request_id=(v->>'requestId')::uuid AND approver_membership_id=p_actor AND token_hash=(v->>'token')) THEN
   RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE='42501'; END IF;
  -- A successful exact replay keeps its own decided link identity; expiry and
  -- closure are first-execution transition rules, not current membership rules.
  allowed:=true;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END CASE;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END $$;
COMMIT;
