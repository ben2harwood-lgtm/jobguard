BEGIN;
-- Q14: retain decisions, cancel unused permission. No scheduler or provider activation.
CREATE FUNCTION app.xc_link_current(p_link uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM app.extra_client_link k
  JOIN app.work_order w ON(w.tenant_id,w.job_id)=(k.tenant_id,k.job_id)
  JOIN app.contractor_member cm ON(cm.tenant_id,cm.membership_id)=(k.tenant_id,k.approver_membership_id)
  JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id)
  JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(m.tenant_id,m.id)
  JOIN app.action_outbox o ON(o.tenant_id,o.id)=(k.tenant_id,k.outbox_action_id)
  WHERE k.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND k.id=p_link
   AND current_database()='jobguard_synthetic_demo'
   AND cm.client_id=k.client_id AND w.client_id=k.client_id AND lower(cm.email)=lower(k.recipient)
   AND m.role='client_approver' AND coalesce(app.contractor_member_active(m.id),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=k.client_id
   AND(g.contract_id IS NULL OR g.contract_id=w.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
   AND (EXISTS(SELECT 1 FROM app.extra_client_link_closure c
         WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id) AND c.kind='decided')
        OR (o.status<>'cancelled' AND app.xc_send_authority(k.issued_by_membership_id,k.variation_id)))
 )
$$;
ALTER FUNCTION app.xc_link_current(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xc_link_current(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- The executor already holds the exclusive tenant authority lock (54). Cancel
-- every unused invitation for this named approver/job, including delayed retries.
-- Outbox cancellation is durable link invalidation: no forged human command/closure.
CREATE FUNCTION app.xc_cancel_authority_loss(p_action uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; target app.extra_client_link; n integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO target FROM app.extra_client_link WHERE tenant_id=t AND outbox_action_id=p_action;
 IF target.id IS NULL THEN RETURN false; END IF;
 UPDATE app.action_outbox o SET status='cancelled',updated_at=clock_timestamp()
 FROM app.extra_client_link k
 WHERE k.tenant_id=t AND k.job_id=target.job_id AND k.approver_membership_id=target.approver_membership_id
  AND(o.tenant_id,o.id)=(k.tenant_id,k.outbox_action_id)
  AND o.action_type='extra.client_approval_request.send' AND o.adapter='fake_email'
  AND o.status IN('pending','retryable')
  AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id))
  AND NOT app.xc_link_current(k.id);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN
  PERFORM app.append_final_check_audit(gen_random_uuid(),'system:outbox',target.job_id,
   'contractor.extra.client_authority_lost',jsonb_build_object('linkId',target.id,'outboxId',p_action));
 END IF;
 RETURN EXISTS(SELECT 1 FROM app.action_outbox WHERE tenant_id=t AND id=p_action AND status='cancelled');
END $$;
ALTER FUNCTION app.xc_cancel_authority_loss(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xc_cancel_authority_loss(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xc_cancel_authority_loss(uuid) TO jobguard_runtime;

-- Latest predecessor bodies copied without other changes; ACL/owner/config preserved.
CREATE OR REPLACE FUNCTION app.xa_client_view_authority(p_job uuid, p_request uuid, p_actor uuid, p_email text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_wo app.work_order; v_client uuid; v_grant uuid;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 SELECT q.client_id INTO v_client FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_wo.id IS NULL OR v_client IS NULL OR v_wo.client_id IS DISTINCT FROM v_client THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT g.id INTO v_grant FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_actor AND cm.client_id=v_client AND lower(cm.email)=lower(p_email) AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_actor),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_client AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1;
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;

 -- Q14: decided links retain history; unused links require both current parties.
 IF EXISTS(SELECT 1 FROM app.extra_client_link k WHERE k.tenant_id=v_tenant
  AND k.job_id=p_job AND k.request_id=p_request AND k.approver_membership_id=p_actor
  AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id))
  AND NOT app.xc_link_current(k.id)) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION identity.extra_customer_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k app.extra_client_link; s app.extra_client_session; closed text; sid uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR operation IS NULL OR operation NOT IN('redeem','resolve','signout') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 -- Same order as approval/withdraw: shared tenant lock, then job lock, then audit.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,417));
 IF operation='redeem' THEN
  SELECT l.* INTO k FROM app.extra_client_signin b JOIN app.extra_client_link l ON(l.tenant_id,l.id)=(b.tenant_id,b.link_id)
   WHERE b.tenant_id=t AND b.signin_digest=digest;
 ELSE
  SELECT * INTO s FROM app.extra_client_session WHERE tenant_id=t AND token_digest=digest;
  SELECT * INTO k FROM app.extra_client_link WHERE tenant_id=t AND id=s.link_id;
 END IF;
 -- No match delegates to the unchanged customer sign-in implementation.
 IF k.id IS NULL THEN RETURN NULL; END IF;
 IF k.job_id<>j OR k.approver_membership_id<>c THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT app.xc_link_current(k.id) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.xa_client_view_authority(j,k.request_id,c,k.recipient);
 PERFORM app.mon8_require_feature(c,'approval_chains');
 SELECT kind INTO closed FROM app.extra_client_link_closure WHERE tenant_id=t AND link_id=k.id;
 IF closed IN('revoked','replaced') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF operation='redeem' THEN
  IF closed IS NOT NULL OR clock_timestamp()>=k.expires_at OR session_digest IS NULL OR session_digest !~ '^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM app.extra_client_session WHERE tenant_id=t AND link_id=k.id) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  INSERT INTO app.extra_client_session(tenant_id,id,link_id,token_digest,expires_at) VALUES(t,sid,k.id,session_digest,clock_timestamp()+interval '1 hour');
  PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_signed_in',jsonb_build_object('sessionId',sid,'linkId',k.id));
 ELSE
  IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  IF operation='signout' THEN
   UPDATE app.extra_client_session SET revoked_at=clock_timestamp() WHERE tenant_id=t AND id=s.id;
   PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_signed_out',jsonb_build_object('sessionId',s.id));
  END IF;
 END IF;
 RETURN jsonb_build_object('version','customer-session.v1','jobId',j,'customerId',c,'extraApprover',true);
END $$;

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
 IF NOT app.xc_link_current(v_link.id) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
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
COMMIT;
