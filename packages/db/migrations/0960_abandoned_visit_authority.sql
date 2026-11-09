BEGIN;
-- LATER-SAFETY-79 authority repair. Synthetic cleanup uses the checked command
-- lifecycle; no API or production enablement. Forward fix by replacing these
-- routines; historical answers and audit events must never be removed.
INSERT INTO app.command_type_registry VALUES
 ('CloseAbandonedSiteVisit','repository-command.v1','contractor','route_before_begin','site_visit','operational',NULL);

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
 IF p_type='CloseAbandonedSiteVisit' THEN
  IF current_database()<>'jobguard_synthetic_demo' OR p_actor IS DISTINCT FROM app.current_actor()
   OR t IS DISTINCT FROM app.current_tenant() OR role_name NOT IN('owner','admin')
   OR NOT coalesce(app.contractor_allowed(p_actor,'organisation.manage',app.contractor_job_team(p_job)),false) THEN
   RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  RETURN;
 END IF;
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
 WHEN 'WithdrawExtra' THEN allowed:=app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NOT NULL;
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

CREATE OR REPLACE FUNCTION app.lp5_bind_effect(p_command uuid,p_authorization uuid,p_adapter text,p_reference jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim; r app.command_receipt; adapter text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL THEN
  IF p_reference->>'closeKind'='abandoned' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  RETURN; END IF; -- LP-5b unconverted callers retain their own backstops.
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR (c.authorization_id IS DISTINCT FROM p_authorization AND NOT(p_adapter='lock_invoice' AND c.authorization_id IS NULL
   AND p_authorization IS NOT NULL AND EXISTS(SELECT 1 FROM app.customer_invoice invoice
    JOIN app.action_authorization grant_row ON(grant_row.tenant_id,grant_row.id)=(invoice.tenant_id,invoice.authorization_id)
    WHERE invoice.tenant_id=t AND invoice.job_id=(c.resource->>'subjectRef')::uuid AND invoice.id=(p_reference->>'invoiceId')::uuid
     AND invoice.authorization_id=p_authorization AND grant_row.actor_membership_id=c.actor_membership_id
     AND invoice.xmin::text=pg_current_xact_id()::text)))
  OR adapter IS DISTINCT FROM p_adapter OR c.effect_ref IS NOT NULL
  OR p_adapter NOT IN('activation','review','import','site_visit','extra_chain','contractor_extra','source_intake','lock_invoice') OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF r.command_type='CloseAbandonedSiteVisit' OR p_reference->>'closeKind'='abandoned' THEN
  IF r.command_type IS DISTINCT FROM 'CloseAbandonedSiteVisit'
   OR c.actor_membership_id IS DISTINCT FROM r.actor_membership_id
   OR (c.resource->>'subjectRef') IS DISTINCT FROM (p_reference->>'jobId')
   OR (c.significant_input->'input'->>'visitId') IS DISTINCT FROM (p_reference->>'visitId')
   OR encode(sha256(convert_to(c.significant_input->'input'->>'reason','UTF8')),'hex') IS DISTINCT FROM (p_reference->>'reasonHash')
   OR (p_reference->>'closeKind') IS DISTINCT FROM 'abandoned' THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=p_reference,authorization_id=p_authorization WHERE tenant_id=t AND command_id=p_command;
END $$;

CREATE OR REPLACE FUNCTION app.lp5b_contractor_result(p_command uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 c app.command_lifecycle_claim; r app.command_receipt; v jsonb; value jsonb; j uuid; typ text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR c.transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 j:=(c.resource->>'subjectRef')::uuid; typ:=r.command_type;
 v:=(c.significant_input->'input');
 IF typ='CloseAbandonedSiteVisit' THEN
  SELECT jsonb_build_object('answerId',a.id) INTO value
   FROM app.site_visit s JOIN app.closeout_answer a
    ON(a.tenant_id,a.job_id,a.site_visit_id,a.membership_id)=(s.tenant_id,s.job_id,s.id,s.membership_id)
   WHERE s.tenant_id=t AND s.id=(c.effect_ref->>'visitId')::uuid AND s.job_id=j
    AND a.command_id=p_command AND a.answer='no' AND a.server_recorded_at=s.completed_at
    AND a.xmin::text=pg_current_xact_id()::text;
 ELSIF typ IN('StartSiteVisit','CompleteSiteVisit') THEN
  IF typ='StartSiteVisit' THEN
   SELECT jsonb_build_object('visitId',id,'startedAt',to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO value
    FROM app.site_visit WHERE tenant_id=t AND id=(c.effect_ref->>'visitId')::uuid
     AND job_id=j AND membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text;
  ELSE
   SELECT jsonb_build_object('visitId',s.id,'completedAt',to_char(s.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'closeoutAnswer',a.answer) INTO value FROM app.site_visit s JOIN app.closeout_answer a
     ON(a.tenant_id,a.job_id,a.site_visit_id,a.membership_id)=(s.tenant_id,s.job_id,s.id,s.membership_id)
    WHERE s.tenant_id=t AND s.id=(c.effect_ref->>'visitId')::uuid AND s.job_id=j
     AND s.membership_id=c.actor_membership_id AND a.command_id=p_command AND a.answer=(v->>'closeoutAnswer')
     AND a.server_recorded_at=s.completed_at AND a.xmin::text=pg_current_xact_id()::text;
  END IF;
 ELSIF (v ? 'content') THEN
  -- effect_ref comes only from the checked xa routine's internally constructed
  -- return expression. It is not a runtime-submitted result or JSON hint.
  IF (c.effect_ref ? 'result') AND (
   EXISTS(SELECT 1 FROM app.extra_approval_request WHERE tenant_id=t AND command_id=p_command AND job_id=j AND submitter_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_approval_revision_binding WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_approval_outcome WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_approval_step_fact WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_client_link_closure WHERE tenant_id=t AND command_id=p_command AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_duplicate_link WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)) THEN
   value:=(c.effect_ref->'result');
  END IF;
 ELSIF typ IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction','ConfirmPrompt') AND (v ? 'grantId') THEN
  SELECT jsonb_build_object('variationId',o.variation_id) INTO value FROM app.extra_origin o JOIN app.variation x
   ON(x.tenant_id,x.job_id,x.id)=(o.tenant_id,o.job_id,o.variation_id)
   WHERE o.tenant_id=t AND o.job_id=j AND o.raising_membership_id=c.actor_membership_id
    AND o.command_type=typ AND o.raising_grant_id=(v->>'grantId')::uuid
    AND x.description=(v->>'description') AND x.capture_text=(v->>'note')
    AND ((o.command_id=p_command AND o.xmin::text=pg_current_xact_id()::text)
     OR (o.client_capture_id=(v->>'clientCaptureId')::uuid AND EXISTS(
      SELECT 1 FROM app.command_receipt prior LEFT JOIN app.command_lifecycle_claim old ON(old.tenant_id,old.command_id)=(prior.tenant_id,prior.command_id)
      WHERE prior.tenant_id=t AND prior.command_id=o.command_id AND prior.command_type=typ AND prior.actor_membership_id=c.actor_membership_id
       AND prior.status='succeeded' AND ((old.significant_input->'input')=v OR (old.command_id IS NULL
        AND prior.request_hash=encode(sha256(convert_to((c.significant_input->>'legacyJson'),'UTF8')),'hex'))))));
 ELSIF typ='MarkDuplicate' THEN
  SELECT jsonb_build_object('linkId',id,'variationId',duplicate_id) INTO value FROM app.extra_duplicate_link
   WHERE tenant_id=t AND job_id=j AND command_id=p_command AND actor_membership_id=c.actor_membership_id
    AND kind='link' AND duplicate_id=(v->>'duplicateId')::uuid AND canonical_id=(v->>'canonicalId')::uuid
    AND xmin::text=pg_current_xact_id()::text;
 ELSIF typ='RecordClientInstruction' THEN
  SELECT jsonb_build_object('linkId',id,'variationId',variation_id) INTO value FROM app.extra_order_line_link
   WHERE tenant_id=t AND job_id=j AND command_id=p_command AND actor_membership_id=c.actor_membership_id
    AND variation_id=(v->>'variationId')::uuid AND work_order_id=(v->>'workOrderId')::uuid
    AND revision_id=(v->>'revisionId')::uuid AND scope_item_id=(v->>'scopeItemId')::uuid AND xmin::text=pg_current_xact_id()::text;
 ELSIF typ='UnlinkDuplicate' THEN
  SELECT jsonb_build_object('unlinkId',id,'linkId',reverses_link_id,'variationId',duplicate_id,'revision',(v->>'expectedRevision')::integer+1) INTO value
   FROM app.extra_duplicate_link WHERE tenant_id=t AND job_id=j AND command_id=p_command AND actor_membership_id=c.actor_membership_id
    AND kind='unlink' AND reverses_link_id=(v->>'linkId')::uuid AND reason_code=(v->>'reasonCode') AND xmin::text=pg_current_xact_id()::text;
 END IF;
 IF value IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN value;
END $$;

-- LATER-SAFETY-79: synthetic owner/admin recovery only. Ordinary completion and
-- EndCheck stay unchanged. No feature gate: cleanup must survive lost access.
CREATE OR REPLACE FUNCTION app.ent3b_close_abandoned_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_reason text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; visit_row app.site_visit;
 answer_id uuid:=gen_random_uuid(); recorded timestamptz;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 PERFORM app.lp5b_contractor_permission('CloseAbandonedSiteVisit',p_actor,p_job,jsonb_build_object('jobId',p_job));
 IF p_command IS NULL OR p_job IS NULL OR p_visit IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command
  AND r.status='processing' AND r.command_type='CloseAbandonedSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 -- The private binder requires this transaction's begin_command claim and exact input.
 PERFORM app.lp5_bind_effect(p_command,NULL,'site_visit',jsonb_build_object('visitId',p_visit,'jobId',p_job,
  'closeKind','abandoned','reasonHash',encode(sha256(convert_to(p_reason,'UTF8')),'hex')));
 PERFORM 1 FROM app.job WHERE tenant_id=tenant AND id=p_job FOR SHARE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_visit::text,3102));
 SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=tenant AND v.id=p_visit AND v.job_id=p_job;
 IF visit_row.id IS NULL OR visit_row.completed_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.ent3b_visit_authority(visit_row.membership_id,p_job) a WHERE a.decision='allowed') THEN
  RAISE EXCEPTION 'VISIT_NOT_ABANDONED' USING ERRCODE='55000'; END IF;
 recorded:=pg_catalog.clock_timestamp();
 UPDATE app.site_visit SET completed_at=recorded WHERE tenant_id=tenant AND id=p_visit;
 -- Preserve the visit member, question version, one-answer invariant and server time.
 -- This administrative 'no' is distinguished from an operative answer by its receipt/audit.
 INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at)
 VALUES(tenant,answer_id,p_job,visit_row.work_order_id,p_visit,visit_row.membership_id,'closeout-question.v1','no',p_command,recorded);
 -- Last contending lock is the audit head. Never put free-text reasons in audit.
 PERFORM app.append_audit(jsonb_build_array(jsonb_build_object('id',answer_id,'version','audit.v1',
  'actorRef','membership:'||p_actor::text,'eventType','contractor.visit.completed','subjectType','site-visit','subjectRef',p_visit::text,
  'payload',jsonb_build_object('references',jsonb_build_object('command',p_command::text,'job',p_job::text,'visit',p_visit::text,
   'closeoutAnswer',answer_id::text,'closeKind','abandoned','environment','synthetic_demo'),
   'hashes',jsonb_build_object('reason',encode(sha256(convert_to(p_reason,'UTF8')),'hex'))))));
 RETURN answer_id;
END $$;
ALTER FUNCTION app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3b_close_abandoned_visit(uuid,uuid,uuid,uuid,text) TO jobguard_runtime;

-- Latest guard body on main: 0139_site_visit_closeout.sql. Keep the normal command branch intact;
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
