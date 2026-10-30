-- LP-5b RED: operational receipt writers. No actor binding or grant withdrawal (LP-6 / LP-5c).
-- Forward fix only: preserve receipts and immutable history when repairing this migration.
BEGIN;
-- Ownership transfers need schema CREATE only for this transaction.
GRANT CREATE ON SCHEMA app TO jobguard_command_writer;
ALTER TABLE app.command_type_registry DROP CONSTRAINT command_type_registry_permission_rule_check;
ALTER TABLE app.command_type_registry ADD CONSTRAINT command_type_registry_permission_rule_check CHECK(permission_rule IN('owner','active_member','contractor'));
INSERT INTO app.command_type_registry VALUES
 ('StartSiteVisit','repository-command.v1','contractor','route_before_begin','site_visit','operational',NULL),
 ('CompleteSiteVisit','repository-command.v1','contractor','route_before_begin','site_visit','operational',NULL),
 ('SubmitExtra','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('PriceExtra','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('ReviseExtra','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('ApproveExtraStep','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('RejectExtra','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('WithdrawExtra','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('RevokeClientApproval','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('ClientDecideExtra','repository-command.v1','contractor','route_before_begin','extra_chain','operational',NULL),
 ('MarkDuplicate','repository-command.v1','contractor','route_before_begin','contractor_extra','operational',NULL),
 ('LogSiteExtra','repository-command.v1','contractor','route_before_begin','contractor_extra','operational',NULL),
 ('RecordOfficeExtra','repository-command.v1','contractor','route_before_begin','contractor_extra','operational',NULL),
 ('RecordClientInstruction','repository-command.v1','contractor','route_before_begin','contractor_extra','operational',NULL),
 ('UnlinkDuplicate','repository-command.v1','contractor','route_before_begin','contractor_extra','operational',NULL),
 ('ConfirmPrompt','repository-command.v1','contractor','route_before_begin','contractor_extra','operational',NULL),
 ('recovery.message.preview','repository-command.v1','owner','route_before_begin','recovery_message_marker','operational',NULL),
 ('recovery.message.revoke','repository-command.v1','owner','route_before_begin','recovery_message_marker','operational',NULL),
 ('recovery.message.advance','repository-command.v1','owner','route_before_begin','recovery_message_marker','operational',NULL),
 ('recovery.message.reconcile','repository-command.v1','owner','route_before_begin','recovery_message_marker','operational',NULL),
 ('recovery.follow_up.schedule','repository-command.v1','owner','route_before_begin','recovery_follow_up_marker','operational',NULL),
 ('recovery.follow_up.advance','repository-command.v1','owner','route_before_begin','recovery_follow_up_marker','operational',NULL),
 ('recovery.follow_up.open_review','repository-command.v1','owner','route_before_begin','recovery_follow_up_marker','operational',NULL),
 ('recovery.follow_up.cancel','repository-command.v1','owner','route_before_begin','recovery_follow_up_marker','operational',NULL),
 ('prevention.check','repository-command.v1','owner','route_before_begin','prevention','operational',NULL),
 ('inbox.seed','repository-command.v1','active_member','route_before_begin','inbox_seed','operational',NULL),
 ('commercial_integrity.review','repository-command.v1','owner','route_before_begin','operational_record','operational',NULL),
 ('synthetic_demo.seed','repository-command.v1','owner','route_before_begin','operational_record','operational',NULL),
 ('LogBuilderExtra','repository-command.v1','owner','route_before_begin','builder_capture','operational',NULL),
 ('AddFinalReviewExtra','repository-command.v1','owner','route_before_begin','builder_capture','operational',NULL),
 ('proof.complete','repository-command.v1','active_member','route_before_begin','proof','operational',NULL),
 ('job.parties','repository-command.v1','owner','route_before_begin','job_parties','operational',NULL);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['variation','extra_origin','customer_revision','site_revision','stage_completion','evidence_link','evidence_object','scope_progress','recovery_message_event','recovery_follow_up','recovery_follow_up_event','recovery_follow_up_advance','site_visit','closeout_answer','extra_approval_request','extra_approval_revision_binding','extra_approval_outcome','extra_approval_step_fact','extra_duplicate_link','extra_order_line_link','property_constraint_fact','counterparty_check','job_party_current','inbox_finding_revision','inbox_decision_revision','inbox_preference_revision','inbox_outcome_event','watchdog_command_identity','variation_revision'] LOOP
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_command_writer',n);
  EXECUTE format('CREATE POLICY lp5b_command_read ON app.%I FOR SELECT TO jobguard_command_writer USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
GRANT SELECT ON app.job_party_snapshot TO jobguard_command_writer;

-- Feedback and demo checkpoints used to exist only in receipts. Keep their
-- business facts separately so a receipt is never its own completion proof.
CREATE TABLE app.repository_operational_record (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, job_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, record_kind text NOT NULL CHECK(record_kind IN('feedback','demo_checkpoint')),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.repository_operational_record OWNER TO jobguard_command_writer;
ALTER TABLE app.repository_operational_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.repository_operational_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.repository_operational_record TO jobguard_command_writer
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.repository_operational_record FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER repository_operational_record_immutable BEFORE UPDATE OR DELETE ON app.repository_operational_record
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

CREATE FUNCTION app.record_repository_command(p_command uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; v jsonb; result jsonb; kind text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR c.version<>'repository-command.v1' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR r.status IS DISTINCT FROM 'processing' OR current_database()<>'jobguard_synthetic_demo'
  OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=c.actor_membership_id AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 v:=c.significant_input->'input';
 IF r.command_type='commercial_integrity.review' THEN
  IF v-ARRAY['jobId','version','commandId','findingKey','explanation','outcome']<>'{}'
   OR NOT(v ?& ARRAY['jobId','version','commandId','findingKey','explanation','outcome'])
   OR v->>'version' IS DISTINCT FROM 'commercial-integrity-review.v1' OR v->>'commandId'<>p_command::text
   OR v->>'jobId' IS DISTINCT FROM c.resource->>'subjectRef' OR v->>'outcome'<>'dismissed_false_positive'
   OR jsonb_typeof(v->'findingKey') IS DISTINCT FROM 'string' OR length(v->>'findingKey')<1
   OR jsonb_typeof(v->'explanation') IS DISTINCT FROM 'string' OR length(v->>'explanation') NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  kind:='feedback'; result:=v||jsonb_build_object('recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 ELSIF r.command_type='synthetic_demo.seed' THEN
  IF v-ARRAY['version','commandId','semanticKey','tenantId','jobId','scopeItemId','checkpoint','amount']<>'{}'
   OR v->>'version' IS DISTINCT FROM 'demo-seed-command.v1' OR v->>'commandId' IS DISTINCT FROM p_command::text
   OR t<>'11111111-1111-4111-8111-111111111111'::uuid OR v->>'tenantId' IS DISTINCT FROM t::text
   OR v->>'jobId' IS DISTINCT FROM c.resource->>'subjectRef' OR v->>'jobId'<>'d1500000-0000-4000-8000-000000000150'
   OR v->>'scopeItemId' IS DISTINCT FROM 'd1500000-0000-4000-8000-000000001500'
   OR v->>'checkpoint' IS NULL OR v->>'checkpoint' NOT IN('capture','review_confirm','quote_sent','accepted','live','decision',
     'verified_proof','approved_extra','final_account','issued_invoice','recorded_payment','fee_illustration')
   OR r.semantic_key IS DISTINCT FROM 'm1-15.demo-seed.v1:'||(v->>'checkpoint')
   OR v->>'semanticKey' IS DISTINCT FROM r.semantic_key
   OR v->'amount' IS DISTINCT FROM (CASE WHEN v->>'checkpoint'='recorded_payment'
      THEN '{"pence":150000,"currency":"GBP"}'::jsonb ELSE 'null'::jsonb END) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  kind:='demo_checkpoint'; result:=jsonb_build_object('checkpoint',v->>'checkpoint');
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO app.repository_operational_record(tenant_id,command_id,job_id,actor_membership_id,record_kind,result)
 VALUES(t,p_command,(c.resource->>'subjectRef')::uuid,c.actor_membership_id,kind,result);
END $$;
ALTER FUNCTION app.record_repository_command(uuid) OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.record_repository_command(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.record_repository_command(uuid) TO jobguard_runtime,jobguard_migration;

-- LP-5b contractor permission adapter. It takes no business lock; callers retain
-- their existing authority/admin/job/receipt phases. Actor binding is LP-6.
CREATE FUNCTION app.lp5b_contractor_permission(p_type text,p_actor uuid,p_job uuid,p_input jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 v jsonb:=(CASE WHEN p_input ? 'content' THEN p_input->'content' ELSE p_input END);
 role_name text; allowed boolean; roles text[]; step jsonb; req app.extra_approval_request;
BEGIN
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT role INTO role_name FROM app.membership WHERE tenant_id=t AND id=p_actor;
 IF (v->>'jobId')::uuid IS DISTINCT FROM p_job
  OR (p_input ? 'actor' AND (p_input->>'actor')::uuid IS DISTINCT FROM p_actor)
  OR (p_input ? 'actorMembershipId' AND (p_input->>'actorMembershipId')::uuid IS DISTINCT FROM p_actor)
  OR (p_input ? 'membershipId' AND (p_input->>'membershipId')::uuid IS DISTINCT FROM p_actor) THEN
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
  IF p_type IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction') AND v ? 'grantId' THEN
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
 IF p_input->>'type' IS DISTINCT FROM p_type THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
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
  step:=req.requirement->'steps'->(v->>'stepIndex')::integer;
  -- Replay uses the original step, not the current next-step count. Transition
  -- checks (already decided/self/separation) still belong to xa_approve.
  roles:=ARRAY[step->>'role'];
  IF EXISTS(SELECT 1 FROM app.extra_escalation_fact WHERE tenant_id=t AND request_id=req.id AND step_index=(v->>'stepIndex')::integer) THEN
   roles:=roles||(step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(step->'alternateRoles')); END IF;
  allowed:=step->>'kind'='human' AND step->>'role'<>'client_approver'
   AND app.xa_covers(p_actor,roles,p_job,'extra.approve') IS NOT NULL;
 WHEN 'ClientDecideExtra' THEN
  PERFORM app.xa_client_view_authority(p_job,(v->>'requestId')::uuid,p_actor,v->>'email');
  IF NOT EXISTS(SELECT 1 FROM app.extra_client_link WHERE tenant_id=t AND job_id=p_job
   AND request_id=(v->>'requestId')::uuid AND approver_membership_id=p_actor AND token_hash=v->>'token') THEN
   RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE='42501'; END IF;
  -- A successful exact replay keeps its own decided link identity; expiry and
  -- closure are first-execution transition rules, not current membership rules.
  allowed:=true;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END CASE;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.lp5b_contractor_permission(text,uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp5b_contractor_permission(text,uuid,uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp5b_contractor_permission(text,uuid,uuid,jsonb) TO jobguard_command_writer;

-- Private result adapter is invoked as the command owner, with the same narrow
-- tenant read grants as the existing LP-5a adapters. No business locks here.
CREATE FUNCTION app.lp5b_contractor_result(p_command uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 c app.command_lifecycle_claim; r app.command_receipt; v jsonb; value jsonb; j uuid; typ text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR c.transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 j:=(c.resource->>'subjectRef')::uuid; typ:=r.command_type;
 v:=c.significant_input->'input';
 IF typ IN('StartSiteVisit','CompleteSiteVisit') THEN
  IF typ='StartSiteVisit' THEN
   SELECT jsonb_build_object('visitId',id,'startedAt',to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO value
    FROM app.site_visit WHERE tenant_id=t AND id=(c.effect_ref->>'visitId')::uuid
     AND job_id=j AND membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text;
  ELSE
   SELECT jsonb_build_object('visitId',s.id,'completedAt',to_char(s.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'closeoutAnswer',a.answer) INTO value FROM app.site_visit s JOIN app.closeout_answer a
     ON(a.tenant_id,a.job_id,a.site_visit_id,a.membership_id)=(s.tenant_id,s.job_id,s.id,s.membership_id)
    WHERE s.tenant_id=t AND s.id=(c.effect_ref->>'visitId')::uuid AND s.job_id=j
     AND s.membership_id=c.actor_membership_id AND a.command_id=p_command AND a.answer=v->>'closeoutAnswer'
     AND a.server_recorded_at=s.completed_at AND a.xmin::text=pg_current_xact_id()::text;
  END IF;
 ELSIF v ? 'content' THEN
  -- effect_ref comes only from the checked xa routine's internally constructed
  -- return expression. It is not a runtime-submitted result or JSON hint.
  IF c.effect_ref ? 'result' AND (
   EXISTS(SELECT 1 FROM app.extra_approval_request WHERE tenant_id=t AND command_id=p_command AND job_id=j AND submitter_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_approval_revision_binding WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_approval_outcome WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_approval_step_fact WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_client_link_closure WHERE tenant_id=t AND command_id=p_command AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)
   OR EXISTS(SELECT 1 FROM app.extra_duplicate_link WHERE tenant_id=t AND command_id=p_command AND job_id=j AND actor_membership_id=c.actor_membership_id AND xmin::text=pg_current_xact_id()::text)) THEN
   value:=c.effect_ref->'result';
  END IF;
 ELSIF typ IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction','ConfirmPrompt') AND v ? 'grantId' THEN
  SELECT jsonb_build_object('variationId',o.variation_id) INTO value FROM app.extra_origin o JOIN app.variation x
   ON(x.tenant_id,x.job_id,x.id)=(o.tenant_id,o.job_id,o.variation_id)
   WHERE o.tenant_id=t AND o.job_id=j AND o.raising_membership_id=c.actor_membership_id
    AND o.command_type=typ AND o.raising_grant_id=(v->>'grantId')::uuid
    AND x.description=v->>'description' AND x.capture_text=v->>'note'
    AND ((o.command_id=p_command AND o.xmin::text=pg_current_xact_id()::text)
     OR (o.client_capture_id=(v->>'clientCaptureId')::uuid AND EXISTS(
      SELECT 1 FROM app.command_receipt prior LEFT JOIN app.command_lifecycle_claim old ON(old.tenant_id,old.command_id)=(prior.tenant_id,prior.command_id)
      WHERE prior.tenant_id=t AND prior.command_id=o.command_id AND prior.command_type=typ AND prior.actor_membership_id=c.actor_membership_id
       AND prior.status='succeeded' AND (old.significant_input->'input'=v OR (old.command_id IS NULL
        AND prior.request_hash=encode(sha256(convert_to(c.significant_input->>'legacyJson','UTF8')),'hex'))))));
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
    AND kind='unlink' AND reverses_link_id=(v->>'linkId')::uuid AND reason_code=v->>'reasonCode' AND xmin::text=pg_current_xact_id()::text;
 END IF;
 IF value IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN value;
END $$;
ALTER FUNCTION app.lp5b_contractor_result(uuid,jsonb) OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp5b_contractor_result(uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.xa_submit(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_origin app.extra_origin; v_sor app.extra_sor_revision; v_bind app.extra_approval_revision_binding; v_role text; v_ok boolean; v_bid uuid; v_net bigint; v_hash text; v_rev uuid;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['SubmitExtra'],p_actor);
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT m.role INTO v_role FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor;
 SELECT s.* INTO v_sor FROM app.extra_sor_revision s WHERE(s.tenant_id,s.job_id,s.variation_id)=(v_tenant,p_job,p_variation);
 v_ok:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor'],p_job,'job.read') IS NOT NULL
  OR(v_role='operative' AND p_actor=v_origin.raising_membership_id AND v_sor.id IS NOT NULL AND coalesce(app.contractor_job_allowed(p_actor,'extra.log',p_job),false));
 IF NOT v_ok THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF app.xa_latest_kind(v_tenant,p_job,p_variation) IS DISTINCT FROM 'logged' OR EXISTS(SELECT 1 FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation) THEN
  RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
 END IF;
 SELECT b.* INTO v_bind FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 IF v_sor.id IS NOT NULL THEN
  IF v_bind.id IS NULL THEN
   v_bid:=pg_catalog.gen_random_uuid();
   INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,sor_revision_id,source_hash,command_id,actor_membership_id)
   VALUES(v_tenant,v_bid,p_job,p_variation,1,'server_sor',v_sor.id,v_sor.id,v_sor.content_hash,p_command,p_actor);
  ELSE v_bid:=v_bind.id; END IF;
  v_net:=v_sor.net_pence; v_hash:=v_sor.content_hash::text; v_rev:=NULL;
 ELSIF v_bind.id IS NOT NULL THEN
  v_bid:=v_bind.id; v_hash:=v_bind.source_hash::text; v_rev:=v_bind.variation_revision_id;
  SELECT r.signed_delta_pence INTO v_net FROM app.variation_revision r WHERE(r.tenant_id,r.job_id,r.id)=(v_tenant,p_job,v_rev);
 ELSE v_bid:=NULL; v_net:=NULL; v_hash:=v_origin.origin_hash::text; v_rev:=NULL; END IF;
 lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev,v_hash,v_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.xa_price(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_net bigint, p_revise boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_origin app.extra_origin; v_var app.variation; v_prev app.extra_approval_revision_binding; v_req app.extra_approval_request; v_outcome text; v_latest text; v_rev_id uuid:=pg_catalog.gen_random_uuid(); v_rev_no integer; v_prev_rev uuid; v_hash text; v_bid uuid:=pg_catalog.gen_random_uuid(); v_ref text; v_late boolean:=false; v_old_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_revise THEN 'ReviseExtra' ELSE 'PriceExtra' END],p_actor);
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Ben, 13 Oct 2026 (answer 12): surveyors price. Revising a price is pricing.
 IF app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_net IS NULL OR p_net NOT BETWEEN 1 AND 1000000000000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 SELECT b.* INTO v_prev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 IF NOT p_revise THEN
  -- Two legal starting points: never submitted (logged, no request), or submitted UNPRICED and not yet decided (the latest request has no net and no outcome). The second supersedes that request.
  v_late:=v_latest='awaiting_approval' AND v_req.id IS NOT NULL AND v_req.net_pence IS NULL AND v_req.binding_id IS NULL AND v_prev.id IS NULL
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
  IF NOT v_late AND (v_latest IS DISTINCT FROM 'logged' OR v_req.id IS NOT NULL OR v_prev.id IS NOT NULL) OR EXISTS(SELECT 1 FROM app.extra_sor_revision s WHERE(s.tenant_id,s.variation_id)=(v_tenant,p_variation)) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT o.kind INTO v_outcome FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id);
  IF v_req.id IS NULL OR v_outcome NOT IN('approved','rejected') OR v_latest NOT IN('approved','rejected') OR v_req.net_pence IS NOT DISTINCT FROM p_net THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT v.* INTO v_var FROM app.variation v WHERE(v.tenant_id,v.job_id,v.id)=(v_tenant,p_job,p_variation);
 SELECT r.revision,r.id INTO v_rev_no,v_prev_rev FROM app.variation_revision r WHERE(r.tenant_id,r.variation_id)=(v_tenant,p_variation) ORDER BY r.revision DESC LIMIT 1;
 v_rev_no:=coalesce(v_rev_no,0)+1;
 v_ref:='surveyor-quote:'||p_command::text;
 v_hash:=encode(sha256(convert_to(jsonb_build_array('surveyor-quoted-revision.v1',v_tenant,v_rev_id,p_job,p_variation,v_rev_no,v_prev_rev,p_net,p_actor,p_command)::text,'UTF8')),'hex');
 INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
 VALUES(v_rev_id,v_tenant,p_job,p_variation,v_var.scope_item_id,v_rev_no,v_prev_rev,v_var.description,'1','item',p_net,p_net,v_hash,p_actor,'human_entered',v_ref,encode(sha256(convert_to(v_ref,'UTF8')),'hex'),'surveyor-quote.v1');
 INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,variation_revision_id,source_hash,predecessor_binding_id,command_id,actor_membership_id)
 VALUES(v_tenant,v_bid,p_job,p_variation,coalesce(v_prev.logical_revision,0)+1,'ordinary',v_rev_id,v_rev_id,v_hash,v_prev.id,p_command,p_actor);
 IF p_revise THEN lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result; END IF;
 IF v_late THEN
  -- The unpriced snapshot is superseded by the new request revision (older revisions are refused as stale); its open Decision is dismissed.
  SELECT count(*) INTO v_old_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_old_n,'dismissed',p_actor);
  lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net)||jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'supersededRequestId',v_req.id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 lp5_result:=jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'revisionHash',v_hash,'netPence',p_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
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
 SELECT f.step_index,f.request_id INTO v_prior FROM app.extra_approval_step_fact f JOIN app.extra_approval_request q ON(q.tenant_id,q.id)=(f.tenant_id,f.request_id)
  WHERE f.tenant_id=v_tenant AND q.variation_id=v_req.variation_id AND f.actor_membership_id=p_actor ORDER BY (f.request_id=p_request) DESC,f.step_index LIMIT 1;
 IF v_prior.request_id IS NOT NULL THEN
  IF v_prior.request_id=p_request OR v_prior.step_index<>v_n THEN RAISE EXCEPTION 'REUSED_APPROVER' USING ERRCODE='23514'; END IF;
  RAISE EXCEPTION 'REPEAT_HELD' USING ERRCODE='23514';
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

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_open boolean; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['WithdrawExtra'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation) AND x.job_track='contractor' AND x.provenance='command') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Ben, 13 Oct 2026 (answer 12): supervisors withdraw. Wider roles are held and therefore refused.
 IF app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
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

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.xa_mark_duplicate(p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['MarkDuplicate'],p_actor);
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_duplicate=p_canonical OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_duplicate) AND x.job_track='contractor')
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_canonical) AND x.job_track='contractor') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
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

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.xa_revoke_link(p_job uuid, p_link uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_link app.extra_client_link;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['RevokeClientApproval'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT k.* INTO v_link FROM app.extra_client_link k WHERE(k.tenant_id,k.job_id,k.id)=(v_tenant,p_job,p_link);
 IF v_link.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(v_tenant,p_link)) THEN RAISE EXCEPTION 'LINK_REVOKED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_link,'revoked',p_actor,p_command);
 lp5_result:=jsonb_build_object('linkId',p_link,'outboxActionId',v_link.outbox_action_id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;

-- Latest definition: 0158_extra_approval_chain.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.xa_client_decide(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_token_hash text, p_email text, p_hash text, p_net bigint, p_reject boolean, p_reason text, p_role_name text, p_tester text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp5_result jsonb; v_tenant uuid; v_link app.extra_client_link; v_closure text; v_req app.extra_approval_request; v_wo app.work_order; v_n integer; v_total integer; v_rev uuid; v_grant uuid; v_final boolean;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['ClientDecideExtra'],p_actor);
 SELECT k.* INTO v_link FROM app.extra_client_link k WHERE k.tenant_id=v_tenant AND k.token_hash=p_token_hash;
 IF v_link.id IS NULL OR v_link.approver_membership_id<>p_actor THEN RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE='42501'; END IF;
 SELECT c.kind INTO v_closure FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(v_tenant,v_link.id);
 IF v_closure='decided' THEN RAISE EXCEPTION 'LINK_REPLAYED' USING ERRCODE='23514'; END IF;
 IF v_closure IS NOT NULL THEN RAISE EXCEPTION 'LINK_REVOKED' USING ERRCODE='23514'; END IF;
 IF clock_timestamp()>=v_link.expires_at THEN RAISE EXCEPTION 'LINK_EXPIRED' USING ERRCODE='23514'; END IF;
 IF p_email IS NULL OR lower(p_email)<>lower(v_link.recipient) THEN RAISE EXCEPTION 'EMAIL_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 IF v_link.job_id<>p_job OR v_link.request_id<>p_request OR v_wo.client_id IS DISTINCT FROM v_link.client_id THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.client_id<>v_link.client_id THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR app.xa_latest_kind(v_tenant,p_job,v_req.variation_id) IS DISTINCT FROM 'awaiting_approval' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT g.id INTO v_grant FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_actor AND cm.client_id=v_req.client_id AND lower(cm.email)=lower(p_email) AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_actor),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_req.client_id AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1;
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF v_req.requirement->'steps'->v_n->>'role' IS DISTINCT FROM 'client_approver' THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 IF v_req.revision_hash::text IS DISTINCT FROM p_hash OR v_req.net_pence IS DISTINCT FROM p_net OR v_req.net_pence IS NULL THEN RAISE EXCEPTION 'HASH_MISMATCH' USING ERRCODE='23514'; END IF;
 IF p_role_name IS NULL OR p_tester IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 SELECT b.variation_revision_id INTO v_rev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.id)=(v_tenant,v_req.binding_id);
 INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),v_link.id,'decided',p_actor,p_command);
 IF p_reject THEN
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'rejected',p_reason,'client_approver',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'rejected',v_rev,p_reason,p_command,p_actor);
  lp5_result:=jsonb_build_object('requestId',p_request,'state','rejected','stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,actor_membership_id,grant_id,approved_hash,approved_net_pence,fictional_role_name,actual_tester_reference,command_id)
 VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,v_n,'client_approver','client_approver',p_actor,v_grant,v_req.revision_hash,v_req.net_pence,p_role_name,p_tester,p_command);
 v_total:=jsonb_array_length(v_req.requirement->'steps'); v_final:=v_n+1=v_total;
 IF v_final THEN
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'approved','client_approver',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'approved',v_rev,NULL,p_command,p_actor);
 END IF;
 lp5_result:=jsonb_build_object('requestId',p_request,'state',CASE WHEN v_final THEN 'approved' ELSE 'awaiting_approval' END,'stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END $$;

-- Latest definition: 0139_site_visit_closeout.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.ent3b_start_visit(p_actor uuid, p_command uuid, p_job uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; answers integer; answered text; order_id uuid; new_visit uuid:=gen_random_uuid();
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- The tenant lock merged contractor administration takes exclusively: a grant, membership or team change cannot land between this check and the commit.
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR p_command IS NULL OR p_job IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command AND r.status='processing' AND r.command_type='StartSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT count(*)::integer, min(a.decision) INTO answers, answered FROM app.ent3b_visit_authority(p_actor,p_job) a;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_job::text||':'||p_actor::text,3101));
 IF EXISTS(SELECT 1 FROM app.site_visit v WHERE v.tenant_id=tenant AND v.job_id=p_job AND v.membership_id=p_actor AND v.completed_at IS NULL) THEN
  RAISE EXCEPTION 'VISIT_ALREADY_OPEN' USING ERRCODE='55000';
 END IF;
 SELECT w.id INTO order_id FROM app.work_order w WHERE w.tenant_id=tenant AND w.job_id=p_job;
 IF order_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- No time is supplied: started_at is the column default.
 INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES(tenant,new_visit,p_job,order_id,p_actor);
 PERFORM app.lp5_bind_effect(p_command,NULL,'site_visit',jsonb_build_object('visitId',new_visit)); RETURN new_visit;
END $$;

-- Latest definition: 0139_site_visit_closeout.sql; private effect handoff only.
CREATE OR REPLACE FUNCTION app.ent3b_complete_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; answers integer; answered text; visit_row app.site_visit; answer_id uuid:=gen_random_uuid(); recorded timestamptz;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR p_command IS NULL OR p_job IS NULL OR p_visit IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command AND r.status='processing' AND r.command_type='CompleteSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 IF p_answer IS NULL OR p_answer NOT IN('yes','no') THEN RAISE EXCEPTION 'CLOSEOUT_ANSWER_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*)::integer, min(a.decision) INTO answers, answered FROM app.ent3b_visit_authority(p_actor,p_job) a;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_visit::text,3102));
 SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=tenant AND v.id=p_visit AND v.job_id=p_job AND v.membership_id=p_actor;
 IF visit_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF visit_row.completed_at IS NOT NULL THEN RAISE EXCEPTION 'VISIT_ALREADY_COMPLETED' USING ERRCODE='55000'; END IF;
 -- One server reading is both the completion time and the answer's recorded time.
 recorded:=pg_catalog.clock_timestamp();
 UPDATE app.site_visit SET completed_at=recorded WHERE tenant_id=tenant AND id=p_visit;
 INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at)
  VALUES(tenant,answer_id,p_job,visit_row.work_order_id,p_visit,p_actor,'closeout-question.v1',p_answer,p_command,recorded);
 PERFORM app.lp5_bind_effect(p_command,NULL,'site_visit',jsonb_build_object('visitId',p_visit)); RETURN answer_id;
END $$;

CREATE OR REPLACE FUNCTION app.lp5_bind_effect(p_command uuid,p_authorization uuid,p_adapter text,p_reference jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim; r app.command_receipt; adapter text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL THEN RETURN; END IF; -- LP-5b unconverted callers retain their own backstops.
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.authorization_id IS DISTINCT FROM p_authorization OR adapter IS DISTINCT FROM p_adapter OR c.effect_ref IS NOT NULL
  OR p_adapter NOT IN('activation','review','import','site_visit','extra_chain','contractor_extra') OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=p_reference WHERE tenant_id=t AND command_id=p_command;
END $$;

-- Integrate into complete_command after current-authority/grant checks and before
-- lp5_command_result: for adapter IN('prevention','inbox_seed'), call
-- app.lp5b_prepare_projection(p_command_id), then reload c for noopReason.
-- Add lp5_command_result CASE adapters to call lp5b_projection_result(p_command_id).
-- Inputs to completion remain {}; trusted snapshot references are private.
CREATE FUNCTION app.lp5b_prepare_projection(p_command uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; v jsonb; j uuid; b uuid; refs jsonb; ids jsonb; at_time timestamptz:=clock_timestamp();
 q bigint; watch app.counterparty_check; expected_count integer; actual_count integer; preference_actor text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.effect_ref IS NOT NULL OR c.outcome IS NOT NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 j:=(c.resource->>'subjectRef')::uuid; v:=c.significant_input->'input';
 IF r.command_type='prevention.check' THEN
  IF (v->>'job')::uuid IS DISTINCT FROM j THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  v:=v->'input'; b:=(v->>'expectedBindingId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=t AND job_id=j AND binding_id=b) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF v->>'action'='property' THEN
   SELECT count(*) INTO actual_count FROM app.property_constraint_fact
    WHERE tenant_id=t AND job_id=j AND command_id=p_command AND binding_id=b AND xmin::text=pg_current_xact_id()::text;
   expected_count:=5;
  ELSE
   expected_count:=(CASE v->>'action' WHEN 'evaluate_watch' THEN 2 WHEN 'company' THEN 1 WHEN 'start_watch' THEN 1 WHEN 'stop_watch' THEN 1 ELSE -1 END);
   SELECT count(*) INTO actual_count FROM app.counterparty_check
    WHERE tenant_id=t AND job_id=j AND command_id=p_command AND binding_id=b AND xmin::text=pg_current_xact_id()::text
     AND ((v->>'action'='company' AND kind='company')
      OR (v->>'action'='evaluate_watch' AND kind IN('companies_house_feed','gazette_feed') AND watch_revision=(v->>'expectedWatchRevision')::integer)
      OR (v->>'action'='start_watch' AND kind='watch_start' AND watch_revision=(v->>'expectedWatchRevision')::integer+1)
      OR (v->>'action'='stop_watch' AND kind='watch_stop' AND watch_revision=(v->>'expectedWatchRevision')::integer+1));
  END IF;
  IF actual_count IS DISTINCT FROM expected_count THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  refs:=jsonb_build_object('bindingId',b,'retrievedAt',to_char(date_trunc('milliseconds',at_time) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'latestCustomerRevisionId',(SELECT cr.id FROM app.job_party_binding pb JOIN app.customer_revision cr
    ON(cr.tenant_id,cr.customer_id)=(pb.tenant_id,pb.customer_id) WHERE pb.tenant_id=t AND pb.id=b ORDER BY cr.revision DESC LIMIT 1));
  SELECT coalesce(jsonb_agg(x.id ORDER BY x.kind),'[]'::jsonb) INTO ids FROM(
   SELECT DISTINCT ON(kind) id,kind FROM app.property_constraint_fact
    WHERE tenant_id=t AND job_id=j AND binding_id=b ORDER BY kind,created_at DESC,id DESC) x;
  refs:=refs||jsonb_build_object('propertyIds',ids,'companyId',(SELECT id FROM app.counterparty_check
   WHERE tenant_id=t AND job_id=j AND binding_id=b AND kind='company' ORDER BY created_at DESC,id DESC LIMIT 1));
  SELECT * INTO watch FROM app.counterparty_check WHERE tenant_id=t AND job_id=j AND binding_id=b
   AND kind IN('watch_start','watch_stop') ORDER BY watch_revision DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(x.id ORDER BY x.kind),'[]'::jsonb) INTO ids FROM(
   SELECT DISTINCT ON(kind) id,kind FROM app.counterparty_check WHERE tenant_id=t AND job_id=j AND binding_id=b
    AND watch_revision=watch.watch_revision AND kind IN('companies_house_feed','gazette_feed') ORDER BY kind,created_at DESC,id DESC) x;
  refs:=refs||jsonb_build_object('watchId',watch.id,'feedIds',ids);
 ELSIF r.command_type='inbox.seed' THEN
  IF v-ARRAY['jobId','membershipId','commandType','practiceDigest']<>'{}' OR v->>'commandType'<>'inbox.seed'
   OR (v->>'jobId')::uuid IS DISTINCT FROM j OR (v->>'membershipId')::uuid IS DISTINCT FROM c.actor_membership_id
   OR NOT EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=p_command AND job_id=j AND command_type='inbox.seed')
   OR NOT EXISTS(SELECT 1 FROM app.inbox_finding_revision WHERE tenant_id=t AND job_id=j) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  SELECT coalesce(max(sequence),0) INTO q FROM app.audit_event WHERE tenant_id=t;
  preference_actor:=(CASE WHEN v ? 'practiceDigest' THEN 'practice-session:'||(v->>'practiceDigest') ELSE 'member:synthetic-builder' END);
  SELECT coalesce(jsonb_agg(id ORDER BY lane,created_at,id),'[]'::jsonb) INTO ids
   FROM app.inbox_decision_revision WHERE tenant_id=t AND job_id=j;
  refs:=jsonb_build_object('decisionIds',ids,'asOfSequence',q,'preferenceId',
   (SELECT p.id FROM app.inbox_preference_revision p JOIN app.audit_event e ON(e.tenant_id,e.id)=(p.tenant_id,p.audit_event_id)
    WHERE p.tenant_id=t AND p.membership_id=c.actor_membership_id AND p.actor_ref=preference_actor AND e.sequence<=q ORDER BY p.revision DESC LIMIT 1));
  IF NOT EXISTS(SELECT 1 FROM app.inbox_finding_revision WHERE tenant_id=t AND job_id=j AND xmin::text=pg_current_xact_id()::text) THEN
   refs:=refs||jsonb_build_object('noopReason','inbox_already_seeded'); END IF;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=refs WHERE tenant_id=t AND command_id=p_command;
END $$;
ALTER FUNCTION app.lp5b_prepare_projection(uuid) OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp5b_prepare_projection(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.lp5b_projection_result(p_command uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim; r app.command_receipt;
 j uuid; v jsonb; refs jsonb; snapshot jsonb; saved timestamptz; latest app.customer_revision;
 eligible boolean; property jsonb; company jsonb; watch app.counterparty_check; feeds jsonb; view_json jsonb;
 mandatory jsonb; advisory jsonb; available integer; budget integer; metrics jsonb; q bigint;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR c.transaction_id IS DISTINCT FROM pg_current_xact_id() OR c.effect_ref IS NULL THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 refs:=c.effect_ref; j:=(c.resource->>'subjectRef')::uuid;
 IF r.command_type='prevention.check' THEN
  SELECT s.snapshot,b.created_at INTO snapshot,saved FROM app.job_party_binding b JOIN app.job_party_snapshot s
   ON(s.tenant_id,s.job_id,s.binding_id)=(b.tenant_id,b.job_id,b.id)
   WHERE b.tenant_id=t AND b.job_id=j AND b.id=(refs->>'bindingId')::uuid;
  IF snapshot IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO latest FROM app.customer_revision WHERE tenant_id=t AND id=(refs->>'latestCustomerRevisionId')::uuid;
  eligible:=coalesce(latest.id=(snapshot->>'customerRevisionId')::uuid AND latest.payload->>'type'='business'
   AND latest.payload->>'companyNumber' ~ '^(?:[0-9]{8}|[A-Z]{2}[0-9]{6})$',false);
  SELECT coalesce(jsonb_agg(f.result ORDER BY ids.ordinality),'[]'::jsonb) INTO property
   FROM jsonb_array_elements_text(refs->'propertyIds') WITH ORDINALITY ids(id,ordinality)
   JOIN app.property_constraint_fact f ON f.tenant_id=t AND f.id=ids.id::uuid AND f.job_id=j AND f.binding_id=(refs->>'bindingId')::uuid;
  company:=NULL; feeds:='[]';
  IF eligible THEN
   SELECT result INTO company FROM app.counterparty_check WHERE tenant_id=t AND job_id=j AND id=(refs->>'companyId')::uuid;
   SELECT * INTO watch FROM app.counterparty_check WHERE tenant_id=t AND job_id=j AND id=(refs->>'watchId')::uuid;
   IF watch.kind='watch_start' THEN
    SELECT coalesce(jsonb_agg(f.result ORDER BY ids.ordinality),'[]'::jsonb) INTO feeds
     FROM jsonb_array_elements_text(refs->'feedIds') WITH ORDINALITY ids(id,ordinality)
     JOIN app.counterparty_check f ON f.tenant_id=t AND f.id=ids.id::uuid AND f.job_id=j AND f.binding_id=(refs->>'bindingId')::uuid;
   END IF;
  END IF;
  view_json:=jsonb_build_object('version','prevention-view.v1','environment','synthetic_demo','jobId',j,'retrievedAt',refs->>'retrievedAt',
   'parties',snapshot,'customerType',snapshot->'customer'->>'type','payingParty',jsonb_build_object(
    'name',snapshot->'payingParty'->>'name','revisionId',snapshot->>'payingPartyRevisionId','source','Builder''s saved paying-party record',
    'retrievedAt',refs->>'retrievedAt','recordedAt',to_char(date_trunc('milliseconds',saved) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
   'companyEligibility',(CASE WHEN eligible THEN 'eligible' ELSE 'not run — not a registered company' END),
   'eligibilityPolicyVersion','prevention-company-eligibility-reference.v1','property',property,'company',company,
   'watch',jsonb_build_object('enabled',coalesce(eligible AND watch.kind='watch_start',false),
    'revision',(CASE WHEN eligible THEN coalesce(watch.watch_revision,0) ELSE 0 END),'results',feeds),'realExternalActions',0);
  RETURN jsonb_build_object('version','prevention-command-result.v1','environment','synthetic_demo','commandId',p_command,'view',view_json,'realExternalActions',0);
 ELSIF r.command_type='inbox.seed' THEN
  q:=(refs->>'asOfSequence')::bigint;
  SELECT coalesce((SELECT advisory_budget FROM app.inbox_preference_revision WHERE tenant_id=t AND id=(refs->>'preferenceId')::uuid),100) INTO budget;
  WITH ordered AS (
   SELECT d.*,i.ordinality,EXISTS(SELECT 1 FROM app.inbox_outcome_event o JOIN app.audit_event e ON(e.tenant_id,e.id)=(o.tenant_id,o.audit_event_id)
    WHERE o.tenant_id=t AND o.decision_id=d.id AND o.event_kind IN('dismissed','approved') AND e.sequence<=q) resolved
   FROM jsonb_array_elements_text(refs->'decisionIds') WITH ORDINALITY i(id,ordinality)
   JOIN app.inbox_decision_revision d ON d.tenant_id=t AND d.job_id=j AND d.id=i.id::uuid
  ), open AS (
   SELECT *,row_number() OVER(PARTITION BY lane ORDER BY ordinality) lane_order,
    jsonb_build_object('id',id,'title',(CASE rule_id WHEN 'supplier-check' THEN 'Review supplier invoice' WHEN 'proof-required' THEN 'Electrical proof required' WHEN 'approval-required' THEN 'Variation approval required' ELSE 'Review work readiness' END),
     'lane',lane,'explanation',(CASE rule_id WHEN 'supplier-check' THEN 'The recorded supplier rule found a cited discrepancy.' WHEN 'proof-required' THEN 'The recorded completion rule requires verified electrical proof.' WHEN 'approval-required' THEN 'The recorded variation has no matching customer approval.' ELSE 'Recorded planning facts include an unresolved dependency.' END),
     'permittedAction',(CASE rule_id WHEN 'proof-required' THEN 'Add verified proof' WHEN 'approval-required' THEN 'Review approval' ELSE 'Inspect or dismiss' END),
     'amountPence',(CASE rule_id WHEN 'supplier-check' THEN 32000 WHEN 'approval-required' THEN 12500 ELSE NULL END),
     'sources',source_references,'ruleId',rule_id,'ruleRevision',rule_revision,'findingRevision',finding_revision) value
   FROM ordered WHERE NOT resolved
  ) SELECT coalesce(jsonb_agg(value ORDER BY ordinality) FILTER(WHERE lane='mandatory'),'[]'),
    coalesce(jsonb_agg(value ORDER BY ordinality) FILTER(WHERE lane='advisory' AND lane_order<=budget),'[]'),
    coalesce(sum(jsonb_array_length(source_references)) FILTER(WHERE lane='advisory'),0)
   INTO mandatory,advisory,available FROM open;
  WITH events AS (
   SELECT DISTINCT ON(o.command_id,o.event_kind) o.* FROM app.inbox_outcome_event o JOIN app.audit_event e ON(e.tenant_id,e.id)=(o.tenant_id,o.audit_event_id)
    WHERE o.tenant_id=t AND o.job_id=j AND e.sequence<=q ORDER BY o.command_id,o.event_kind,e.sequence DESC
  ), created AS (
   SELECT DISTINCT ON(rule_id,rule_revision,finding_revision) * FROM events WHERE event_kind='created' ORDER BY rule_id,rule_revision,finding_revision,created_at DESC,id DESC
  ), durations AS (
   SELECT greatest(0,extract(epoch FROM(e.scenario_at-c.scenario_at))*1000) ms FROM events e JOIN created c
    ON(c.rule_id,c.rule_revision,c.finding_revision)=(e.rule_id,e.rule_revision,e.finding_revision) WHERE e.event_kind<>'created'
  ) SELECT jsonb_build_object('created',count(*) FILTER(WHERE event_kind='created'),'dismissed',count(*) FILTER(WHERE event_kind='dismissed'),
    'approved',count(*) FILTER(WHERE event_kind='approved'),'resolutionTimeMs',(SELECT floor(avg(ms)+0.5) FROM durations),'clockVersion','scenario-clock.v1')
   INTO metrics FROM events;
  RETURN jsonb_build_object('clock',jsonb_build_object('version','scenario-clock.v1','now','2026-04-08T10:00:00.000Z'),
   'advisoryBudget',budget,'mandatory',mandatory,'advisory',advisory,'availableAdvisory',available,'metrics',metrics);
 END IF;
 RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
END $$;
ALTER FUNCTION app.lp5b_projection_result(uuid) OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp5b_projection_result(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- The three lifecycle routines start from their latest definitions, migration 0475.
CREATE OR REPLACE FUNCTION app.begin_command(p_version text,p_command_id uuid,p_command_type text,p_semantic_key text,
 p_resource jsonb,p_expected_revisions jsonb,p_significant_input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid;
 reg app.command_type_registry; prior app.command_receipt; found_count integer:=0;
 digest text; digest_input jsonb; legacy_digest text; legacy_input jsonb; claimed uuid; dec uuid; res uuid; auth uuid; a jsonb; existing_dec uuid;
BEGIN
 actor:=(p_resource->>'actorMembershipId')::uuid;
 -- No membership lock upgrade: preserve the receipt FK KEY SHARE deadlock fix.
 IF t IS NULL OR t IS DISTINCT FROM (p_resource->>'tenantId')::uuid OR NOT EXISTS(
  SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND revoked_at IS NULL
   AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=p_command_type AND version=p_version;
 IF NOT FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.permission_rule='owner' AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL OR p_semantic_key IS NULL OR length(p_semantic_key) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(p_resource) IS DISTINCT FROM 'object' OR p_resource-ARRAY['tenantId','actorMembershipId','subjectType','subjectRef']<>'{}'
  OR NOT(p_resource ?& ARRAY['tenantId','actorMembershipId','subjectType','subjectRef'])
  OR jsonb_typeof(p_resource->'subjectType') IS DISTINCT FROM 'string' OR jsonb_typeof(p_resource->'subjectRef') IS DISTINCT FROM 'string'
  OR length(p_resource->>'subjectType') NOT BETWEEN 1 AND 100 OR length(p_resource->>'subjectRef') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(p_expected_revisions) IS DISTINCT FROM 'object' OR jsonb_typeof(p_significant_input) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF p_significant_input->>'version' IS DISTINCT FROM p_version
  OR (p_significant_input->>'actorMembershipId')::uuid IS DISTINCT FROM actor
  OR (p_version='command.v1' AND (p_significant_input->>'commandType' IS DISTINCT FROM p_command_type
   OR p_significant_input->>'subjectType' IS DISTINCT FROM p_resource->>'subjectType'
   OR p_significant_input->>'subjectRef' IS DISTINCT FROM p_resource->>'subjectRef')) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 -- Pre-cutover receipts keep their exact historical digest format. No new claim
 -- is recorded with this digest. Legacy replay still checks both keys and access.
 legacy_input:=p_significant_input;
 IF p_version='repository-command.v1' THEN
  IF p_significant_input-ARRAY['version','actorMembershipId','input','legacyJson']<>'{}'
   OR jsonb_typeof(p_significant_input->'input') IS DISTINCT FROM 'object'
   OR jsonb_typeof(p_significant_input->'legacyJson') IS DISTINCT FROM 'string'
   OR (p_significant_input->>'legacyJson')::jsonb IS DISTINCT FROM p_significant_input->'input'
   OR p_expected_revisions<>'{}'::jsonb THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF p_resource->>'subjectType' IS DISTINCT FROM 'job'
   OR (p_resource->>'subjectRef')::uuid IS NULL
   OR (p_significant_input->'input' ? 'actorMembershipId' AND (p_significant_input->'input'->>'actorMembershipId')::uuid IS DISTINCT FROM actor)
   OR (p_significant_input->'input' ? 'membershipId' AND (p_significant_input->'input'->>'membershipId')::uuid IS DISTINCT FROM actor)
   OR (p_significant_input->'input' ? 'tenantId' AND (p_significant_input->'input'->>'tenantId')::uuid IS DISTINCT FROM t)
   OR (p_significant_input->'input' ? 'jobId' AND (p_significant_input->'input'->>'jobId')::uuid IS DISTINCT FROM (p_resource->>'subjectRef')::uuid)
   OR (p_significant_input->'input' ? 'job' AND (p_significant_input->'input'->>'job')::uuid IS DISTINCT FROM (p_resource->>'subjectRef')::uuid)
   OR (p_significant_input->'input' ? 'commandId' AND (p_significant_input->'input'->>'commandId')::uuid IS DISTINCT FROM p_command_id)
   OR (p_significant_input->'input'->'input' ? 'commandId' AND (p_significant_input->'input'->'input'->>'commandId')::uuid IS DISTINCT FROM p_command_id) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 IF p_version='command.v1' THEN
  legacy_input:=jsonb_set(legacy_input-ARRAY['commandId','decisionId','resolutionId','authorizationId'],'{action,expiresAt}','{}');
 END IF;
 legacy_digest:=encode(sha256(convert_to((CASE WHEN p_version='repository-command.v1'
  THEN p_significant_input->>'legacyJson' ELSE app.final_lock_canonical(legacy_input) END),'UTF8')),'hex');
 -- Preserve the historical exclusion of server-generated grant expiry. It
 -- remains in the immutable authorization and is checked for fresh execution;
 -- a replay neither renews that grant nor repeats its business effect.
 digest_input:=p_significant_input-ARRAY['commandId','decisionId','resolutionId','authorizationId'];
 IF p_version='command.v1' THEN
  digest_input:=jsonb_set(digest_input,'{action,expiresAt}','{}');
 END IF;
 -- Principal/resource and every non-generated action term remain significant.
 digest:=encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_object('version',p_version,'commandType',p_command_type,
  'semanticKey',p_semantic_key,'resource',p_resource,'expectedRevisions',p_expected_revisions,
  'input',digest_input)),'UTF8')),'hex');
 IF reg.permission_rule='contractor' THEN
  PERFORM app.lp5b_contractor_permission(p_command_type,actor,(p_resource->>'subjectRef')::uuid,p_significant_input->'input');
 END IF;
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(p_command_id,t,p_command_type,p_semantic_key,digest,'processing',actor) ON CONFLICT DO NOTHING RETURNING command_id INTO claimed;
 IF claimed IS NULL THEN
  -- Resolve BOTH keys, never arbitrary rows[0]. Two different receipts always conflict.
  FOR prior IN SELECT * FROM app.command_receipt WHERE tenant_id=t AND
   (command_id=p_command_id OR (command_type=p_command_type AND semantic_key=p_semantic_key)) LOOP
   found_count:=found_count+1;
   IF prior.actor_membership_id IS DISTINCT FROM actor OR prior.command_type IS DISTINCT FROM p_command_type
    OR (prior.request_hash IS DISTINCT FROM digest AND (prior.request_hash IS DISTINCT FROM legacy_digest
     OR EXISTS(SELECT 1 FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=prior.command_id)))
    OR prior.status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  END LOOP;
  IF found_count<>1 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  -- Recheck after a uniqueness wait, too; never lock membership FOR UPDATE.
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF reg.permission_rule='owner' AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF reg.permission_rule='contractor' THEN
   PERFORM app.lp5b_contractor_permission(p_command_type,actor,(p_resource->>'subjectRef')::uuid,p_significant_input->'input');
  END IF;
  RETURN jsonb_build_object('kind','replay','result',prior.result);
 END IF;
 IF p_version='repository-command.v1' THEN
  NULL; -- Operational writers mint no commercial approval.
 ELSIF reg.completion_adapter='finding' THEN
  IF p_significant_input-ARRAY['version','commandId','semanticKey','actorMembershipId','decisionId','findingFingerprint','resolution','expectedSnapshotRevision']<>'{}'
   OR NOT(p_expected_revisions ? 'snapshotRevision') OR p_expected_revisions-ARRAY['snapshotRevision']<>'{}' OR (p_expected_revisions->>'snapshotRevision')::integer IS DISTINCT FROM (p_significant_input->>'expectedSnapshotRevision')::integer
   OR p_resource->>'subjectRef' IS DISTINCT FROM p_significant_input->>'decisionId'
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF p_significant_input->>'resolution' IS NULL OR p_significant_input->>'resolution' NOT IN('dismissed','rejected')
   OR NOT EXISTS(SELECT 1 FROM app.job_finding WHERE tenant_id=t AND decision_id=(p_significant_input->>'decisionId')::uuid
    AND fingerprint=p_significant_input->>'findingFingerprint' AND snapshot_revision=(p_expected_revisions->>'snapshotRevision')::integer)
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,(p_significant_input->>'decisionId')::uuid,p_significant_input->>'resolution',actor);
 ELSE
  IF p_significant_input-ARRAY['version','commandId','commandType','semanticKey','actorMembershipId','subjectType','subjectRef','decisionId','resolutionId','authorizationId','action']<>'{}'
   OR NOT(p_expected_revisions ? 'aggregateRevision') OR p_expected_revisions-ARRAY['aggregateRevision']<>'{}' THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  a:=p_significant_input->'action';
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT(a ?& ARRAY['actionType','recipient','contentHash','aggregateRevision','amountPence','currency','policyVersion','expiresAt'])
   OR a-ARRAY['actionType','recipient','contentHash','aggregateRevision','amountPence','currency','policyVersion','expiresAt']<>'{}'
   OR (a->>'expiresAt')::timestamptz<=clock_timestamp() OR a->>'expiresAt' IS NULL
   OR a->>'contentHash' IS NULL OR a->>'contentHash'!~'^[a-f0-9]{64}$'
   OR (a->>'aggregateRevision')::integer IS DISTINCT FROM (p_expected_revisions->>'aggregateRevision')::integer
   OR (a->>'aggregateRevision')::integer<0 OR a->>'actionType' IS NULL OR length(a->>'actionType') NOT BETWEEN 1 AND 100
   OR length(a->>'policyVersion') NOT BETWEEN 1 AND 80 OR a->>'policyVersion' IS NULL
   OR ((a->>'amountPence') IS NULL) IS DISTINCT FROM ((a->>'currency') IS NULL)
   OR (a->>'amountPence' IS NOT NULL AND ((a->>'amountPence')::numeric NOT BETWEEN 0 AND 1000000000000 OR a->>'currency'<>'GBP'))
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  -- Operational no-op probes validate the same schema but mint no grant.
  IF reg.completion_adapter<>'synthetic_lock_noop' THEN
  dec:=coalesce((p_significant_input->>'decisionId')::uuid,gen_random_uuid());
  res:=coalesce((p_significant_input->>'resolutionId')::uuid,gen_random_uuid());
  auth:=coalesce((p_significant_input->>'authorizationId')::uuid,gen_random_uuid());
  IF p_significant_input ? 'decisionId' THEN
   SELECT id INTO existing_dec FROM app.decision WHERE tenant_id=t AND id=dec
    AND subject_type=p_resource->>'subjectType' AND subject_ref=p_resource->>'subjectRef' AND action_type=a->>'actionType';
   IF existing_dec IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
    VALUES(dec,t,p_resource->>'subjectType',p_resource->>'subjectRef',a->>'actionType');
  END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(res,t,dec,'approved',actor);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
   VALUES(auth,t,dec,res,actor,a->>'actionType',a->>'recipient',a->>'contentHash',(a->>'aggregateRevision')::integer,
    (a->>'amountPence')::bigint,a->>'currency',a->>'policyVersion',(a->>'expiresAt')::timestamptz);
  END IF;
 END IF;
 INSERT INTO app.command_lifecycle_claim(tenant_id,command_id,actor_membership_id,version,resource,expected_revisions,significant_input,authorization_id)
  VALUES(t,p_command_id,actor,p_version,p_resource,p_expected_revisions,p_significant_input,auth);
 RETURN jsonb_build_object('kind','claim','decisionId',dec,'resolutionId',res,'authorizationId',auth);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR not_null_violation OR string_data_right_truncation THEN
 RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 WHEN unique_violation THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
END $$;

CREATE OR REPLACE FUNCTION app.lp5_command_result(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; adapter text; subject text; a jsonb; value jsonb; expected_revision integer; effect_table text; effect_count bigint;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command_id;
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF c.command_id IS NULL OR adapter IS NULL OR c.actor_membership_id IS DISTINCT FROM r.actor_membership_id
  OR c.transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 subject:=c.resource->>'subjectRef'; a:=c.significant_input->'action'; expected_revision:=(c.expected_revisions->>'aggregateRevision')::integer;
 effect_table:=CASE adapter WHEN 'invoice' THEN 'customer_invoice' WHEN 'credit' THEN 'customer_credit_note'
  WHEN 'payment' THEN 'customer_payment' WHEN 'payment_reversal' THEN 'customer_payment_reversal'
  WHEN 'quote_send' THEN 'quote_send' WHEN 'purchase_order' THEN 'purchase_order_placement'
  WHEN 'message' THEN 'recovery_message_approval' WHEN 'client_link' THEN 'extra_client_link' END;
 IF effect_table IS NOT NULL THEN
  EXECUTE format('SELECT count(*) FROM app.%I WHERE tenant_id=$1 AND authorization_id=$2',effect_table)
   INTO effect_count USING t,c.authorization_id;
  IF effect_count>1 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;

 CASE adapter
 WHEN 'prevention' THEN value:=app.lp5b_projection_result(p_command_id);
 WHEN 'inbox_seed' THEN value:=app.lp5b_projection_result(p_command_id);
 WHEN 'site_visit' THEN value:=app.lp5b_contractor_result(p_command_id,p_outcome);
 WHEN 'extra_chain' THEN value:=app.lp5b_contractor_result(p_command_id,p_outcome);
 WHEN 'contractor_extra' THEN value:=app.lp5b_contractor_result(p_command_id,p_outcome);
 WHEN 'operational_record' THEN
  SELECT x.result INTO value FROM app.repository_operational_record x WHERE x.tenant_id=t AND x.command_id=p_command_id
   AND x.actor_membership_id=c.actor_membership_id AND x.job_id=subject::uuid AND x.record_kind=(CASE WHEN r.command_type='commercial_integrity.review' THEN 'feedback' ELSE 'demo_checkpoint' END)
   AND x.xmin::text=pg_current_xact_id()::text;
 WHEN 'recovery_message_marker' THEN
  a:=c.significant_input->'input';
  IF EXISTS(SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=t AND m.command_id=p_command_id
   AND m.actor_membership_id=c.actor_membership_id AND m.case_id=(a->>'caseId')::uuid AND m.job_id=subject::uuid
   AND m.request_hash=encode(sha256(convert_to(c.significant_input->>'legacyJson','UTF8')),'hex')
   AND m.xmin::text=pg_current_xact_id()::text AND r.command_type='recovery.message.preview')
   OR EXISTS(SELECT 1 FROM app.recovery_message_event e WHERE e.tenant_id=t AND e.command_id=p_command_id
    AND e.actor_membership_id=c.actor_membership_id AND e.case_id=(a->>'caseId')::uuid AND e.job_id=subject::uuid
    AND e.message_id=(a->>'messageId')::uuid AND e.request_hash=encode(sha256(convert_to(c.significant_input->>'legacyJson','UTF8')),'hex')
    AND e.xmin::text=pg_current_xact_id()::text
    AND ((r.command_type='recovery.message.revoke' AND e.kind='revoked')
     OR (r.command_type='recovery.message.advance' AND e.kind IN('started','blocked'))
     OR (r.command_type='recovery.message.reconcile' AND e.kind IN('reconcile_started','outcome_unknown')))) THEN
   value:=jsonb_build_object('recoveryMessageCommand',substr(r.command_type,length('recovery.message.')+1));
  END IF;
 WHEN 'recovery_follow_up_marker' THEN
  a:=c.significant_input->'input';
  IF EXISTS(SELECT 1 FROM app.recovery_follow_up_event e WHERE e.tenant_id=t AND e.command_id=p_command_id
   AND e.actor_membership_id=c.actor_membership_id AND e.case_id=(a->>'caseId')::uuid AND e.job_id=subject::uuid
   AND e.request_hash=encode(sha256(convert_to(c.significant_input->>'legacyJson','UTF8')),'hex')
   AND e.xmin::text=pg_current_xact_id()::text
   AND ((r.command_type='recovery.follow_up.schedule' AND e.kind='scheduled' AND EXISTS(
    SELECT 1 FROM app.recovery_follow_up f WHERE f.tenant_id=t AND f.id=e.follow_up_id AND f.command_id=p_command_id
     AND f.source_message_id=(a->>'sourceMessageId')::uuid AND f.actor_membership_id=c.actor_membership_id))
    OR (r.command_type='recovery.follow_up.open_review' AND e.kind='reminder_previewed' AND e.follow_up_id=(a->>'followUpId')::uuid)
    OR (r.command_type='recovery.follow_up.cancel' AND e.kind='cancelled' AND e.follow_up_id=(a->>'followUpId')::uuid)))
   OR (r.command_type='recovery.follow_up.advance' AND EXISTS(SELECT 1 FROM app.recovery_follow_up_advance x
    JOIN app.recovery_follow_up f ON(f.tenant_id,f.id)=(x.tenant_id,x.follow_up_id)
    WHERE x.tenant_id=t AND x.command_id=p_command_id AND x.actor_membership_id=c.actor_membership_id
     AND x.follow_up_id=(a->>'followUpId')::uuid AND f.case_id=(a->>'caseId')::uuid AND f.job_id=subject::uuid
     AND x.request_hash=encode(sha256(convert_to(c.significant_input->>'legacyJson','UTF8')),'hex')
     AND x.xmin::text=pg_current_xact_id()::text)) THEN
   value:=jsonb_build_object('recoveryFollowUpCommand',substr(r.command_type,length('recovery.follow_up.')+1));
  END IF;
 WHEN 'proof' THEN
  a:=c.significant_input->'input';
  SELECT jsonb_build_object('completionId',s.id,'evidenceId',e.id,'state','complete','decisionId',
    (CASE WHEN a->>'deriveDecision'='true' THEN
     (SELECT d.id FROM app.decision d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.id)
      WHERE d.tenant_id=t AND f.job_id=subject::uuid AND f.subject_ref=(a->>'scopeItemId')||':'||(a->>'requiredEvidenceType')
       AND d.action_type='proof.capture' ORDER BY f.created_at DESC,f.id DESC LIMIT 1)
     ELSE (a->>'decisionId')::uuid END)) INTO value
   FROM app.stage_completion s JOIN app.evidence_link l ON(l.tenant_id,l.id)=(s.tenant_id,s.evidence_link_id)
   JOIN app.evidence_object e ON(e.tenant_id,e.id)=(l.tenant_id,l.evidence_id)
   JOIN app.scope_progress p ON(p.tenant_id,p.job_id,p.scope_item_id)=(s.tenant_id,s.job_id,s.scope_item_id)
   WHERE s.tenant_id=t AND s.command_id=p_command_id AND s.job_id=subject::uuid
    AND s.scope_item_id=(a->>'scopeItemId')::uuid AND s.stage=a->>'stage'
    AND e.id=(a->>'evidenceId')::uuid AND e.job_id=s.job_id AND e.scope_item_id=s.scope_item_id
    AND e.evidence_type=a->>'requiredEvidenceType' AND e.kind='original' AND p.stage='complete'
    AND s.xmin::text=pg_current_xact_id()::text;
  IF value->>'decisionId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.decision d WHERE d.tenant_id=t
   AND d.id=(value->>'decisionId')::uuid AND d.subject_ref=(a->>'scopeItemId')||':'||(a->>'requiredEvidenceType')
   AND d.action_type='proof.capture') THEN RAISE EXCEPTION 'PROOF_NOT_FINAL' USING ERRCODE='23514'; END IF;
 WHEN 'builder_capture' THEN
  SELECT jsonb_build_object('variationId',v.id) INTO value
   FROM app.variation v JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
   WHERE v.tenant_id=t AND v.job_id=subject::uuid AND o.command_id=p_command_id
    AND o.raising_membership_id=c.actor_membership_id AND o.job_track='small_builder'
    AND o.kind=(CASE r.command_type WHEN 'LogBuilderExtra' THEN 'builder_logged' ELSE 'final_review' END)
    AND v.id=(c.significant_input->'input'->'proposal'->>'id')::uuid
    AND v.scope_item_id=(c.significant_input->'input'->'proposal'->>'scopeItemId')::uuid
    AND v.description=c.significant_input->'input'->'proposal'->>'description'
    AND v.capture_text=c.significant_input->'input'->'proposal'->>'captureText'
    AND v.job_id=(c.significant_input->'input'->'proposal'->>'jobId')::uuid
    AND v.capture_kind=c.significant_input->'input'->'proposal'->>'captureKind'
    AND v.existing_scope_item_id IS NOT DISTINCT FROM (c.significant_input->'input'->'proposal'->>'existingScopeItemId')::uuid
    AND v.lineage_parent_scope_item_id IS NOT DISTINCT FROM (c.significant_input->'input'->'proposal'->>'lineageParentScopeItemId')::uuid
    AND o.device_id IS NOT DISTINCT FROM c.significant_input->'input'->>'deviceId'
    AND o.device_captured_at IS NOT DISTINCT FROM (c.significant_input->'input'->>'deviceCapturedAt')::timestamptz
    AND (c.significant_input->'input'->'price'='null'::jsonb OR EXISTS(SELECT 1 FROM app.variation_revision vr
     WHERE vr.tenant_id=t AND vr.variation_id=v.id AND vr.confirmed_by_membership_id=c.actor_membership_id
      AND vr.quantity_decimal=c.significant_input->'input'->'price'->>'quantity'
      AND vr.unit=c.significant_input->'input'->'price'->>'unit'
      AND vr.unit_rate_pence=(c.significant_input->'input'->'price'->>'unitRatePence')::bigint
      AND vr.content_hash=encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_object(
       'description',v.description,'price',c.significant_input->'input'->'price')),'UTF8')),'hex')
      AND vr.xmin::text=pg_current_xact_id()::text))
    AND o.xmin::text=pg_current_xact_id()::text;
 WHEN 'job_parties' THEN
  a:=c.significant_input->'input'->'input';
  IF a->>'action' IN('create_customer','revise_customer') THEN
   SELECT jsonb_build_object('id',customer_id,'revisionId',id,'revision',revision) INTO value FROM app.customer_revision
    WHERE tenant_id=t AND id=(p_outcome->>'revisionId')::uuid AND payload=a->'customer'
     AND revision=(CASE WHEN a->>'action'='create_customer' THEN 1 ELSE (a->>'expectedRevision')::integer+1 END)
     AND (a->>'action'='create_customer' OR customer_id=(a->>'customerId')::uuid)
     AND xmin::text=pg_current_xact_id()::text;
  ELSIF a->>'action'='create_site' THEN
   SELECT jsonb_build_object('id',site_id,'revisionId',id,'reused',a ? 'reuseSiteId') INTO value FROM app.site_revision
    WHERE tenant_id=t AND id=(p_outcome->>'revisionId')::uuid
     AND ((NOT(a ? 'reuseSiteId') AND payload=a->'site' AND xmin::text=pg_current_xact_id()::text)
      OR (a->>'confirmSamePlace'='true' AND site_id=(a->>'reuseSiteId')::uuid
       AND trim(regexp_replace(upper(normalize(coalesce(payload->>'unit',''),NFKC)),'\s+',' ','g'))
        =trim(regexp_replace(upper(normalize(coalesce(a->'site'->>'unit',''),NFKC)),'\s+',' ','g'))
       AND (regexp_replace(upper(payload->>'postcode'),'\s','','g')=regexp_replace(upper(a->'site'->>'postcode'),'\s','','g')
        OR (a->'site' ? 'uprn' AND match_key->>0='uprn'
         AND match_key->>1=regexp_replace(a->'site'->>'uprn','^0+(?=[0-9])','')))
       AND id=(SELECT id FROM app.site_revision WHERE tenant_id=t AND site_id=(a->>'reuseSiteId')::uuid ORDER BY revision DESC LIMIT 1)));
  ELSE
   SELECT jsonb_build_object('id',b.id,'revision',j.revision) INTO value FROM app.job_party_binding b
    JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
    WHERE b.tenant_id=t AND b.id=(p_outcome->>'id')::uuid AND b.job_id=subject::uuid
     AND b.customer_revision_id=(a->'parties'->>'customerRevisionId')::uuid
     AND b.site_revision_id=(a->'parties'->>'siteRevisionId')::uuid
     AND b.paying_party_revision_id=coalesce((a->'parties'->>'payingPartyRevisionId')::uuid,b.customer_revision_id)
     AND j.revision=(a->>'expectedJobRevision')::integer+1 AND b.xmin::text=pg_current_xact_id()::text;
  END IF;
  IF value IS NOT NULL THEN value:=value||jsonb_build_object('version','job-parties-command-result.v1',
   'environment','synthetic_demo','commandId',p_command_id,'realExternalActions',0); END IF;
 WHEN 'review' THEN
  SELECT CASE WHEN p_outcome ? 'revision' THEN jsonb_build_object('jobId',j.id,'revision',j.revision,'status',j.status)
   ELSE jsonb_build_object('jobId',j.id,'reviewId',v.id,'jobRevision',j.revision,'status',j.status) END INTO value
   FROM app.proposal_review v JOIN app.job j ON(j.tenant_id,j.id)=(v.tenant_id,v.job_id)
   WHERE v.tenant_id=t AND j.id=subject::uuid AND v.state='confirmed' AND j.status='quoting'
    AND v.revision=expected_revision AND v.id=(c.effect_ref->>'reviewId')::uuid AND j.revision=(c.effect_ref->>'jobRevision')::integer AND r.semantic_key='job:'||j.id::text||':confirm:'||v.proposal_id::text;
 WHEN 'import' THEN
  SELECT jsonb_build_object('jobId',b.job_id,'baselineId',b.id,'provenance','imported','lifecyclePoint',j.status,
   'acceptedNetValuePence',b.accepted_net_value_pence,'recoveryCapPence',b.recovery_cap_pence,
   'lineageStrength','builder_attested_weaker','lineageLabel','Imported — builder-attested baseline; weaker than a JobGuard-generated and customer-accepted quote.',
   'billing','none','historicFeesCreated',0) INTO value
   FROM app.imported_job_baseline b JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
   WHERE b.tenant_id=t AND b.job_id=subject::uuid AND b.attested_by_membership_id=c.actor_membership_id
    AND b.baseline_hash=a->>'contentHash' AND b.accepted_net_value_pence=(a->>'amountPence')::bigint
    AND b.import_terms_version=a->>'policyVersion' AND b.id=(c.effect_ref->>'baselineId')::uuid;
  -- The parties-import API enriches the legacy mutation's base result. Treat
  -- its two IDs only as references: rederive their relationship and source hash
  -- from the immutable bindings and the baseline before returning the DTO.
  IF value IS NOT NULL AND (p_outcome ? 'sourceJobId' OR p_outcome ? 'sourceBindingId') THEN
   IF jsonb_typeof(p_outcome->'sourceJobId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_outcome->'sourceBindingId') IS DISTINCT FROM 'string'
    OR NOT EXISTS(SELECT 1 FROM app.imported_job_baseline b
     JOIN app.job_party_binding imported ON(imported.tenant_id,imported.job_id)=(b.tenant_id,b.job_id)
     JOIN app.job_party_binding source ON source.tenant_id=b.tenant_id
      AND source.id=(p_outcome->>'sourceBindingId')::uuid AND source.job_id=(p_outcome->>'sourceJobId')::uuid
      AND source.customer_revision_id=imported.customer_revision_id
      AND source.site_revision_id=imported.site_revision_id AND source.paying_party_revision_id=imported.paying_party_revision_id
     WHERE b.tenant_id=t AND b.id=(c.effect_ref->>'baselineId')::uuid AND b.job_id=subject::uuid
      AND b.baseline_hash=encode(sha256(convert_to(
       '{"sourceJobId":'||to_jsonb(p_outcome->>'sourceJobId')::text||',"bindingId":'||to_jsonb(p_outcome->>'sourceBindingId')::text||
       ',"baselineDescription":'||to_jsonb(b.baseline_description)::text||',"netPence":'||b.accepted_net_value_pence::text||'}','UTF8')),'hex'))
   THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
   value:=value||jsonb_build_object('version','job-parties-import-result.v1','environment','synthetic_demo',
    'sourceJobId',p_outcome->>'sourceJobId','sourceBindingId',p_outcome->>'sourceBindingId','realExternalActions',0);
  END IF;
 WHEN 'import_v3' THEN
  SELECT i.result INTO value FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.command_id=p_command_id
   AND i.job_id=subject::uuid AND i.xmin::text=pg_current_xact_id()::text;
 WHEN 'payment' THEN
  SELECT jsonb_build_object('paymentId',id,'provenance','manual_builder_attestation','qualifyingRecoveryProof',false,'platformFeeSettlement',false) INTO value
   FROM app.customer_payment WHERE tenant_id=t AND authorization_id=c.authorization_id AND job_id=subject::uuid
    AND amount_pence=(a->>'amountPence')::bigint;
 WHEN 'finding' THEN
  SELECT jsonb_build_object('decisionId',d.decision_id,'resolution',d.resolution,'authorizedAction',false) INTO value
   FROM app.decision_resolution d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.decision_id)
   WHERE d.tenant_id=t AND d.decision_id=(c.significant_input->>'decisionId')::uuid
    AND d.actor_membership_id=c.actor_membership_id AND d.resolution=c.significant_input->>'resolution'
    AND f.fingerprint=c.significant_input->>'findingFingerprint' AND f.snapshot_revision=(c.expected_revisions->>'snapshotRevision')::integer;
 WHEN 'activation' THEN
  IF a->>'policyVersion'='synthetic_demo_activation.v3' THEN
   SELECT jsonb_build_object('jobId',j.job_id,'activationId',j.id,'termsId',terms.id,'state','live') INTO value
    FROM app.job_activation j JOIN app.job_activation_terms terms ON(terms.tenant_id,terms.activation_id)=(j.tenant_id,j.id)
    WHERE j.tenant_id=t AND j.job_id=subject::uuid AND j.actor_membership_id=c.actor_membership_id
     AND j.accepted_document_hash=a->>'contentHash' AND j.accepted_document_version=expected_revision
     AND j.id=(c.effect_ref->>'activationId')::uuid AND terms.id=(c.effect_ref->>'termsId')::uuid;
  IF value IS NOT NULL AND EXISTS(SELECT 1 FROM app.trial_admission WHERE tenant_id=t AND command_id=p_command_id) THEN
    value:=value||jsonb_build_object('snapshotId',(SELECT snapshot_id FROM app.trial_admission WHERE tenant_id=t AND command_id=p_command_id)); END IF;
  ELSE
   SELECT jsonb_build_object('activationId',j.id,'capSnapshotId',cap.id,'syntheticObligationId',ob.id,'jobId',j.job_id,
    'state','live','mode',j.mode,'acceptedNetValuePence',cap.accepted_net_value_pence,'recoveryCapPence',cap.recovery_cap_pence,
    'label',CASE WHEN j.mode='pilot_no_charge' THEN 'no charge' ELSE 'illustrative only' END) INTO value
    FROM app.activation_acceptance_operation_use u JOIN app.job_activation j ON(j.tenant_id,j.job_id)=(u.tenant_id,u.job_id)
    JOIN app.cap_snapshot cap ON(cap.tenant_id,cap.activation_id)=(j.tenant_id,j.id)
    LEFT JOIN app.synthetic_obligation ob ON(ob.tenant_id,ob.activation_id)=(j.tenant_id,j.id)
    WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
     AND u.actor_membership_id=c.actor_membership_id AND j.job_id=subject::uuid
     AND j.accepted_document_hash=a->>'contentHash' AND j.accepted_document_version=expected_revision;
   -- Owner-connected legacy transition/lock fixtures have no activation row.
   -- Keep their narrow proof for the unchanged commands integration tests:
   -- runtime cannot execute transition_job or become a superuser, and even the
   -- fixture must prove a real live/revision change in this same transaction.
   IF value IS NULL AND a->>'actionType'='switch_live' AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN
    SELECT jsonb_build_object('jobId',id,'revision',app.job.revision,'status',status) INTO value FROM app.job
     WHERE tenant_id=t AND id=subject::uuid AND status='live' AND app.job.revision=expected_revision+1
      AND xmin::text=pg_current_xact_id()::text;
   END IF;
  END IF;
 WHEN 'settlement' THEN
  SELECT jsonb_build_object('settlementId',s.id,'obligationId',s.obligation_id,'label','simulated — not collected') INTO value
   FROM app.activation_acceptance_operation_use u JOIN app.simulated_settlement_event s ON(s.tenant_id,s.job_id)=(u.tenant_id,u.job_id)
   WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
    AND u.actor_membership_id=c.actor_membership_id AND s.obligation_id=subject::uuid AND s.amount_pence=(a->>'amountPence')::bigint;
 WHEN 'acceptance' THEN
  SELECT jsonb_build_object('acceptanceId',q.id,'eventId',e.id,'jobId',q.job_id,'documentId',q.document_id,
   'documentVersion',q.document_version,'documentHash',q.document_hash,'acceptedTotalPence',q.accepted_total_pence,
   'acceptanceKind',q.acceptance_kind,'state','accepted') INTO value
   FROM app.activation_acceptance_operation_use u JOIN app.quote_acceptance q ON(q.tenant_id,q.job_id)=(u.tenant_id,u.job_id)
   JOIN app.acceptance_event e ON(e.tenant_id,e.acceptance_id)=(q.tenant_id,q.id)
   WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
    AND q.actor_membership_id=c.actor_membership_id AND q.document_id=subject::uuid AND q.document_hash=a->>'contentHash'
    AND q.document_version=expected_revision AND q.accepted_total_pence=(a->>'amountPence')::bigint AND e.kind='accepted'
    AND e.id=(p_outcome->>'eventId')::uuid;
 WHEN 'disposition' THEN
  SELECT jsonb_build_object('eventId',e.id,'jobId',e.job_id,'documentId',e.document_id,'kind',e.kind,
   'state',CASE WHEN e.kind='declined' THEN 'lost' ELSE 'quoting' END) INTO value
   FROM app.activation_acceptance_operation_use u JOIN app.acceptance_event e ON(e.tenant_id,e.job_id)=(u.tenant_id,u.job_id)
   WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
    AND e.id=(p_outcome->>'eventId')::uuid AND e.actor_membership_id=c.actor_membership_id AND e.document_id=subject::uuid
    AND e.document_hash=a->>'contentHash' AND e.document_version=expected_revision AND 'quote.'||e.kind=r.command_type;
 WHEN 'quote_send' THEN
  SELECT jsonb_build_object('documentId',s.document_id,'outboxActionId',s.outbox_action_id,'state','issued') INTO value
   FROM app.quote_send s JOIN app.quote_document_version d ON(d.tenant_id,d.id)=(s.tenant_id,s.document_id)
   WHERE s.tenant_id=t AND s.authorization_id=c.authorization_id AND s.document_id=subject::uuid
    AND s.content_hash=a->>'contentHash' AND d.document_version=expected_revision;
 WHEN 'invoice' THEN
  SELECT jsonb_build_object('invoiceId',i.id,'invoiceNumber',i.invoice_number,'pdfSha256',i.pdf_sha256,'reused',i.authorization_id<>c.authorization_id,'synthetic',i.synthetic) INTO value
   FROM app.customer_invoice i JOIN app.action_outbox b ON(b.tenant_id,b.authorization_id)=(i.tenant_id,i.authorization_id)
   WHERE i.tenant_id=t AND (i.authorization_id=c.authorization_id OR i.id=(p_outcome->>'invoiceId')::uuid) AND i.job_id=subject::uuid
    AND i.pdf_sha256=a->>'contentHash' AND i.total_pence=(a->>'amountPence')::bigint
    AND EXISTS(SELECT 1 FROM app.final_account_revision WHERE tenant_id=t AND id=i.final_account_revision_id AND revision=expected_revision);
 WHEN 'credit' THEN
  SELECT jsonb_build_object('creditNoteId',id,'creditNumber',credit_number,'originalInvoiceUnchanged',true) INTO value
   FROM app.customer_credit_note WHERE tenant_id=t AND authorization_id=c.authorization_id AND job_id=subject::uuid
    AND amount_pence=(a->>'amountPence')::bigint;
 WHEN 'payment_reversal' THEN
  SELECT jsonb_build_object('reversalId',x.id,'invoiceId',p.invoice_id) INTO value
   FROM app.customer_payment_reversal x JOIN app.customer_payment p ON(p.tenant_id,p.id)=(x.tenant_id,x.payment_id)
   WHERE x.tenant_id=t AND x.authorization_id=c.authorization_id AND x.job_id=subject::uuid;
 WHEN 'purchase_order' THEN
  SELECT jsonb_build_object('placementId',p.id,'outboxActionId',p.outbox_action_id,'reused',p.authorization_id<>c.authorization_id) INTO value
   FROM app.purchase_order_placement p JOIN app.purchase_order_revision v ON(v.tenant_id,v.id)=(p.tenant_id,p.revision_id)
   WHERE p.tenant_id=t AND p.id=(p_outcome->>'placementId')::uuid AND p.revision_id=subject::uuid
    AND v.revision=expected_revision AND v.authority_hash=a->>'contentHash' AND v.order_net_pence=(a->>'amountPence')::bigint
    AND v.recipient IS NOT DISTINCT FROM a->>'recipient';
 WHEN 'recovery_terms' THEN
  SELECT jsonb_build_object('version','recovery-case-terms.v1','id',id,'tenantId',tenant_id,'jobId',job_id,'caseId',case_id,
   'termsVersion',terms_version,'feePolicyVersion',fee_policy_version,'eligibilityPolicyVersion',eligibility_policy_version,
   'policyStatus',policy_status,'environment',environment,'termsHash',terms_hash,'actorMembershipId',actor_membership_id,
   'commandId',command_id,'authorizationId',authorization_id,'approvedAt',to_char(approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'realExternalActions',0) INTO value
   FROM app.recovery_case_terms_approval WHERE tenant_id=t AND command_id=p_command_id AND authorization_id=c.authorization_id
    AND actor_membership_id=c.actor_membership_id AND case_id=subject::uuid AND terms_hash=a->>'contentHash';
 WHEN 'message' THEN
  SELECT jsonb_build_object('messageId',m.message_id,'outboxActionId',m.outbox_action_id,'authorizationId',m.authorization_id) INTO value
   FROM app.recovery_message_approval m JOIN app.recovery_message d ON(d.tenant_id,d.id)=(m.tenant_id,m.message_id)
   WHERE m.tenant_id=t AND m.authorization_id=c.authorization_id AND d.content_hash=a->>'contentHash'
    AND d.case_revision=expected_revision AND (m.message_id::text=subject OR (c.resource->>'subjectType'='recovery_follow_up' AND EXISTS(SELECT 1 FROM app.decision WHERE tenant_id=t AND id=(c.significant_input->>'decisionId')::uuid AND subject_type='recovery_follow_up' AND subject_ref=subject)));
 WHEN 'client_link' THEN
  SELECT jsonb_build_object('linkId',id,'outboxActionId',outbox_action_id,'requestId',request_id,'replacedOutboxIds',coalesce((SELECT jsonb_agg(k.outbox_action_id ORDER BY x.server_recorded_at,k.id) FROM app.extra_client_link_closure x JOIN app.extra_client_link k ON(k.tenant_id,k.id)=(x.tenant_id,x.link_id) WHERE x.tenant_id=t AND x.command_id=p_command_id AND x.kind='replaced'),'[]'::jsonb)) INTO value
   FROM app.extra_client_link WHERE tenant_id=t AND command_id=p_command_id AND authorization_id=c.authorization_id
    AND issued_by_membership_id=c.actor_membership_id AND variation_id=subject::uuid;
 WHEN 'synthetic_lock_noop' THEN
  -- Explicit existing lock-test contract; not an unknown-type fallback.
  SELECT jsonb_build_object('locked',id) INTO value FROM app.job WHERE tenant_id=t AND id=subject::uuid
   AND p_outcome->>'locked'=id::text;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END CASE;
 IF value IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN value;
END $$;

CREATE OR REPLACE FUNCTION app.complete_command(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; reg app.command_type_registry; value jsonb; refs jsonb; proof_ref jsonb;
BEGIN
 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object' OR p_outcome-ARRAY['eventId','placementId','invoiceId','locked','revision','sourceJobId','sourceBindingId','id','revisionId']<>'{}' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command_id;
 IF c.command_id IS NULL OR r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.outcome IS NOT NULL THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=c.actor_membership_id AND (role=reg.permission_rule OR reg.permission_rule IN('active_member','contractor'))
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF reg.permission_rule='contractor' THEN
  PERFORM app.lp5b_contractor_permission(r.command_type,c.actor_membership_id,(c.resource->>'subjectRef')::uuid,c.significant_input->'input');
 END IF;
 IF c.authorization_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution d ON(d.tenant_id,d.id)=(a.tenant_id,a.resolution_id)
  WHERE a.tenant_id=t AND a.id=c.authorization_id AND a.actor_membership_id=c.actor_membership_id
   AND d.actor_membership_id=c.actor_membership_id AND d.resolution='approved' AND a.revoked_at IS NULL
   AND a.expires_at>(CASE WHEN r.command_type='recovery.terms.approve' THEN transaction_timestamp() ELSE clock_timestamp() END)) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.completion_adapter IN('prevention','inbox_seed') THEN
  PERFORM app.lp5b_prepare_projection(p_command_id);
  SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 END IF;
 value:=app.lp5_command_result(p_command_id,p_outcome);
 IF reg.completion_adapter='proof' AND value->>'decisionId' IS NOT NULL THEN
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,(value->>'decisionId')::uuid,'approved',c.actor_membership_id);
 END IF;
 IF reg.completion_adapter='contractor_extra' AND c.significant_input->'input' ? 'clientCaptureId'
  AND EXISTS(SELECT 1 FROM app.extra_origin o WHERE o.tenant_id=t AND o.job_id=(c.resource->>'subjectRef')::uuid
   AND o.variation_id=(value->>'variationId')::uuid AND o.command_id<>p_command_id
   AND o.client_capture_id=(c.significant_input->'input'->>'clientCaptureId')::uuid) THEN
  c.effect_ref:=coalesce(c.effect_ref,'{}'::jsonb)||jsonb_build_object('noopReason','client_capture_already_exists');
  UPDATE app.command_lifecycle_claim SET effect_ref=c.effect_ref WHERE tenant_id=t AND command_id=p_command_id;
 END IF;
 -- The argument is a reference hint only. Persist exclusively the adapter-derived result.
 proof_ref:=CASE reg.completion_adapter
  WHEN 'job_parties' THEN jsonb_strip_nulls(jsonb_build_object('id',value->'id','revisionId',value->'revisionId'))
  WHEN 'import' THEN (CASE WHEN value ? 'sourceJobId' THEN jsonb_build_object('sourceJobId',value->'sourceJobId','sourceBindingId',value->'sourceBindingId') ELSE '{}'::jsonb END)
  WHEN 'acceptance' THEN jsonb_build_object('eventId',value->'eventId')
  WHEN 'disposition' THEN jsonb_build_object('eventId',value->'eventId')
  WHEN 'purchase_order' THEN jsonb_build_object('placementId',value->'placementId')
  WHEN 'invoice' THEN jsonb_build_object('invoiceId',value->'invoiceId')
  WHEN 'synthetic_lock_noop' THEN jsonb_build_object('locked',value->'locked')
  WHEN 'review' THEN (CASE WHEN value ? 'revision' THEN jsonb_build_object('revision',value->'revision') ELSE '{}'::jsonb END)
  ELSE '{}'::jsonb END;
 UPDATE app.command_lifecycle_claim SET outcome=proof_ref WHERE tenant_id=t AND command_id=p_command_id;
 UPDATE app.command_receipt SET status='succeeded',result=value,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command_id;
 refs:=jsonb_build_object('commandId',p_command_id::text);
 IF c.authorization_id IS NOT NULL THEN refs:=refs||jsonb_build_object('authorizationId',c.authorization_id::text); END IF;
 IF reg.completion_adapter='synthetic_lock_noop' OR value->>'reused'='true' OR c.effect_ref ? 'noopReason' THEN
  refs:=refs||jsonb_build_object('outcome','succeeded_noop','reason',coalesce(c.effect_ref->>'noopReason','adapter_verified_existing_effect')); END IF;
 -- All business writes and the terminal receipt precede the last contending lock.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||c.actor_membership_id::text,'eventType','command.succeeded','subjectType',c.resource->>'subjectType',
  'subjectRef',c.resource->>'subjectRef','payload',jsonb_build_object('references',refs,
  'classifications',jsonb_build_object('action',reg.audit_class)))),'checked_operation');
 RETURN value;
END $$;
REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;
COMMIT;
