BEGIN;
-- MON-8 RED. Entitlement is an additional guard, never a grant or commercial approval.
-- No status backfill, provider action, lifecycle inference or runtime status writer.
CREATE OR REPLACE FUNCTION app.mon8_feature_decision(actor uuid, feature text, purpose text DEFAULT 'new_work') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; assignment app.commercial_track_assignment; status app.contractor_agreement_status_revision;
 agreement app.subscription_agreement_revision; entitlement text:='held'; reason text:='agreement_authority_held';
 contractor_feature boolean; today date;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END;
 IF t IS NULL OR actor IS NULL OR feature IS NULL OR purpose IS NULL
 OR feature NOT IN('watchdog','final_check','invoices','recovery_cases','pay_now','accounting_export','operative_roles','site_origin_capture','approval_chains','work_orders','sso')
 OR purpose NOT IN('new_work','retained_read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Organisation/status before subscription/lifecycle before business locks before audit.
 contractor_feature:=feature IN('operative_roles','site_origin_capture','approval_chains','work_orders','sso');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF NOT contractor_feature AND purpose='new_work' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,184)); END IF;
 -- Read after both waits. The actor belongs to this transaction's verified tenant.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF purpose='retained_read' THEN
  -- Availability only: each reader must still enforce its exact role/resource/export permissions.
  entitlement:='included'; reason:='available';
 ELSE
  SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  today:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date;
  IF NOT contractor_feature THEN SELECT * INTO agreement FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=today ORDER BY effective_date DESC,revision DESC LIMIT 1; END IF;
  IF assignment.commercial_track='contractor' THEN
   IF contractor_feature THEN
    SELECT * INTO status FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
    IF status.status='active' THEN entitlement:='included'; reason:='available'; END IF;
   ELSE entitlement:='excluded'; reason:='track_forbidden'; END IF;
  ELSIF assignment.commercial_track='small_builder' OR (assignment.id IS NULL AND (agreement.id IS NOT NULL OR contractor_feature)) THEN
   IF contractor_feature THEN entitlement:='excluded'; reason:='track_forbidden';
   ELSIF agreement.id IS NOT NULL AND agreement.plan IN('Solo','Builder') THEN
    entitlement:='included';
    -- Live payment/accounting readiness and persisted MON-3 trial authority are not on main.
    reason:=CASE WHEN feature IN('pay_now','accounting_export') THEN 'feature_disabled' ELSE 'available' END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('version','plan-entitlement-decision.v1','environment','synthetic_demo','feature',feature,
  'entitlement',entitlement,'executable',reason='available','reason',reason);
END $$;
ALTER FUNCTION app.mon8_feature_decision(uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_feature_decision(uuid,text,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_feature_decision(uuid,text,text) TO jobguard_runtime;
CREATE OR REPLACE FUNCTION app.mon8_require_feature(actor uuid,feature text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT (app.mon8_feature_decision(actor,feature)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.mon8_require_feature(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_require_feature(uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_require_feature(uuid,text) TO jobguard_runtime;

-- Current membership is separate from eligibility. Historical resource permissions remain unchanged.
CREATE OR REPLACE FUNCTION app.contractor_member_active(m uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.membership a JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(a.tenant_id,a.id)
 WHERE a.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND a.id=m AND a.role=ANY(ARRAY['owner','admin','operative','supervisor','surveyor','commercial_manager','finance','read_only','client_approver']) AND (a.role='client_approver')=(c.client_id IS NOT NULL) AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=a.tenant_id AND r.membership_id=a.id))
$$;
CREATE OR REPLACE FUNCTION app.mon8_agreement_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'AGREEMENT_STATUS_IMMUTABLE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,54));
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'; END IF;
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END $$;

-- Persisted normal-company adapter: identity is checked again after both lock waits.
CREATE FUNCTION app.mon8_company_feature(digest text,feature text,job uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; result jsonb;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 result:=app.mon8_feature_decision(actor,feature);
 IF app.mon1_company_actor(t,digest) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF job IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=t AND j.id=job) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.mon8_company_feature(text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_company_feature(text,text,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_company_feature(text,text,uuid) TO jobguard_runtime;
-- Restore fail-closed contractor writes without changing membership-only retained reads
-- or security-reducing commands. These are the legacy actor/writer boundaries that
-- previously inherited their track check solely from contractor_member_active.
-- CREATE OR REPLACE preserves each existing owner and execution ACL.
CREATE FUNCTION app.mon8_retained_fee_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 IF pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT m.id INTO a FROM app.contractor_session(p_session) x JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(x.tenant_id,x.membership_id,x.identity_user_id)
 WHERE x.tenant_id=t AND m.role='finance' AND coalesce(app.contractor_member_active(m.id),false)
  AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND EXISTS(SELECT 1 FROM app.role_grant g WHERE(g.tenant_id,g.membership_id)=(t,m.id) AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(t,g.id)));
 IF a IS NULL THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
ALTER FUNCTION app.mon8_retained_fee_actor(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_retained_fee_actor(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.ef_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a uuid;
BEGIN
 a:=app.mon8_retained_fee_actor(p_session);
 PERFORM app.mon8_require_feature(a,'approval_chains');
 -- Finance scope and session are read again after the entitlement lock wait.
 RETURN app.mon8_retained_fee_actor(p_session);
END $$;

CREATE FUNCTION app.mon8_retained_baseline_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s
 WHERE s.tenant_id=t AND app.contractor_member_active(s.membership_id);
 IF a IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN a;
END $$;
ALTER FUNCTION app.mon8_retained_baseline_actor(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_retained_baseline_actor(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.enterprise_baseline_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid;
BEGIN
 a:=app.mon8_retained_baseline_actor(p_session);
 PERFORM app.mon8_require_feature(a,'work_orders');
 RETURN a;
END $$;

CREATE OR REPLACE FUNCTION app.ent3a_extra_authority(p_actor uuid, p_command_type text, p_job uuid)
RETURNS TABLE(decision text, reason_code text, raising_grant uuid)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; member_role text; permission text; named_required boolean; chosen uuid;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL OR p_actor IS NULL THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text,NULL::uuid; RETURN;
 END IF;
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
 IF p_command_type IS NULL OR p_command_type NOT IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction') THEN
  RETURN QUERY SELECT 'forbidden'::text,'command_type_not_permitted'::text,NULL::uuid; RETURN;
 END IF;
 SELECT m.role INTO member_role FROM app.membership m WHERE m.tenant_id=tenant AND m.id=p_actor;
 -- Only new authority facts. Permission scope and operative assignment remain ENT-2's decision.
 SELECT rule.permission,rule.named_required INTO permission,named_required FROM (VALUES
  ('LogSiteExtra','operative','extra.log',true),
  ('LogSiteExtra','supervisor','extra.log',false),
  ('LogSiteExtra','surveyor','job.read',false),
  ('RecordOfficeExtra','owner','organisation.manage',false),
  ('RecordOfficeExtra','admin','organisation.manage',false),
  ('RecordOfficeExtra','finance','data.import',false),
  ('RecordClientInstruction','owner','contract.manage',false),
  ('RecordClientInstruction','admin','contract.manage',false),
  ('RecordClientInstruction','commercial_manager','contract.manage',false)
 ) AS rule(command_type,role,permission,named_required)
 WHERE rule.command_type=p_command_type AND rule.role=member_role;
 IF permission IS NULL THEN
  RETURN QUERY SELECT 'forbidden'::text,'role_not_permitted'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(j.tenant_id,j.id)
  JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.work_order_current current_revision ON(current_revision.tenant_id,current_revision.work_order_id)=(w.tenant_id,w.id)
  JOIN app.work_order_revision revision ON(revision.tenant_id,revision.work_order_id,revision.id)=(w.tenant_id,w.id,current_revision.revision_id)
  WHERE j.tenant_id=tenant AND j.id=p_job AND j.provenance='work_order'
   AND track.job_track='contractor' AND track.environment='synthetic_demo' AND revision.status<>'cancelled') THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT coalesce(app.contractor_job_allowed(p_actor,permission,p_job),false)
  OR (named_required AND NOT coalesce(app.contractor_job_assigned(p_actor,p_job),false)) THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 -- Lookup only: ENT-4b's insert trigger remains the structural scope judge.
 SELECT g.id INTO chosen FROM app.role_grant g
 JOIN app.team team ON team.tenant_id=g.tenant_id AND team.id=app.contractor_job_team(p_job)
 JOIN app.org_unit branch ON(branch.tenant_id,branch.id)=(team.tenant_id,team.branch_id)
 WHERE g.tenant_id=tenant AND g.membership_id=p_actor AND g.role=member_role
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation revocation WHERE(revocation.tenant_id,revocation.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=tenant
   OR g.scope_kind='team' AND g.scope_id=team.id
   OR g.scope_kind='branch' AND g.scope_id=branch.id
   OR g.scope_kind='region' AND g.scope_id=branch.parent_id)
 ORDER BY g.id LIMIT 1;
 IF chosen IS NULL THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 RETURN QUERY SELECT 'allowed'::text,'allowed'::text,chosen;
END $$;

CREATE OR REPLACE FUNCTION app.practice_worker_switch_decision(p_session_ref uuid,p_worker uuid)
 RETURNS TABLE(decision text,reason_code text,company uuid,owner_member uuid,owner_user uuid,worker_user uuid)
 LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record; member_user uuid;
BEGIN
 BEGIN SELECT * INTO STRICT rule FROM app.practice_company_made_up(p_session_ref);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  decision:='forbidden'; reason_code:='unexpected'; RETURN NEXT; RETURN;
 END;
 decision:='forbidden'; reason_code:=rule.reason_code;
 IF rule.verdict IS DISTINCT FROM 'made_up' THEN RETURN NEXT; RETURN; END IF;
 PERFORM app.mon8_require_feature(rule.owner_member,'operative_roles');
 company:=rule.company; owner_member:=rule.owner_member; owner_user:=rule.owner_user;
 decision:='not_found'; reason_code:='worker';
 SELECT m.identity_user_id INTO member_user FROM app.membership m
 WHERE m.tenant_id=rule.company AND m.id=p_worker AND m.id<>rule.owner_member
 AND m.role IN('operative','supervisor','surveyor','client_approver') AND app.contractor_member_active(m.id)
 AND NOT EXISTS(SELECT 1 FROM app.role_grant g WHERE g.tenant_id=rule.company AND g.membership_id=m.id
  AND g.role NOT IN('operative','supervisor','surveyor','client_approver')
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=rule.company AND r.grant_id=g.id))
 AND NOT EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.membership_locator l WHERE l.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.session s WHERE s.user_id=m.identity_user_id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 decision:='allowed'; reason_code:='allowed'; worker_user:=member_user; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION app.link_contractor_customer(actor uuid,client uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.customer_revision; client_kind text; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF t IS NULL OR client IS NULL OR NOT coalesce(app.contractor_allowed(actor,'organisation.manage',client),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR payload-ARRAY['version','environment','commandId','customerRevisionId']<>'{}'::jsonb
 OR payload->>'version' IS DISTINCT FROM 'contractor-customer-link.v1' OR NOT payload ?& ARRAY['commandId','customerRevisionId']
 OR payload->>'commandId' IS NULL OR payload->>'customerRevisionId' IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('clientId',client,'command',payload)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.command_type<>'contractor_parties.link' OR prior.status<>'succeeded' OR prior.request_hash<>h OR prior.actor_membership_id<>actor
  OR NOT EXISTS(SELECT 1 FROM app.contractor_client_customer b WHERE b.tenant_id=t AND b.client_id=client AND b.command_id=prior.command_id AND b.id::text=prior.result->>'id') THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 -- The parameter is qualified with the function name because customer_revision also has a payload column.
 SELECT r.* INTO c FROM app.customer_revision r WHERE r.tenant_id=t AND r.id=(link_contractor_customer.payload->>'customerRevisionId')::uuid;
 IF c.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 -- Integrator decision (CH-3b round 2): a link is made against the customer's LATEST revision only; an older revision fails closed.
 IF c.revision<>(SELECT max(r.revision) FROM app.customer_revision r WHERE r.tenant_id=t AND r.customer_id=c.customer_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT o.client_type INTO client_kind FROM app.client_organisation o WHERE o.tenant_id=t AND o.id=client;
 IF c.payload->>'type' IS DISTINCT FROM client_kind THEN RAISE EXCEPTION 'CUSTOMER_TYPE_MISMATCH' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.contractor_client_customer WHERE tenant_id=t AND client_id=client) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 result:=jsonb_build_object('version','contractor-party-result.v1','environment','synthetic_demo','commandId',payload->>'commandId','id',row_id,'realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor_parties.link',(payload->>'commandId'),h,'succeeded',result,actor,clock_timestamp());
 INSERT INTO app.contractor_client_customer(tenant_id,id,client_id,customer_id,customer_revision_id,command_id,actor_membership_id)
 VALUES(t,row_id,client,c.customer_id,c.id,(payload->>'commandId')::uuid,actor);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION app.lp_authority(p_session uuid,p_job uuid,p_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; identity_user uuid; member_role text; role_set text[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id,s.identity_user_id INTO a,identity_user FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 -- Lock the session row so a revocation cannot pass this command's recheck.
 PERFORM 1 FROM control_plane.contractor_practice_session s WHERE s.session_digest=app.contractor_practice_session_digest(p_session) FOR SHARE;
 SELECT m.role INTO member_role FROM app.membership m JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
 WHERE m.tenant_id=t AND m.id=a AND m.identity_user_id=identity_user AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE(r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
 role_set:=CASE p_action WHEN 'materials' THEN ARRAY['finance','owner'] WHEN 'list' THEN ARRAY['supervisor'] WHEN 'endcheck' THEN ARRAY['owner'] ELSE ARRAY['supervisor','surveyor','commercial_manager'] END;
 IF member_role IS NULL OR NOT member_role=ANY(role_set) OR NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
  JOIN app.team tm ON tm.tenant_id=j.tenant_id AND tm.id=app.contractor_job_team(j.id)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(tm.tenant_id,tm.branch_id)
  JOIN app.role_grant g ON g.tenant_id=j.tenant_id AND g.membership_id=a AND g.role=member_role
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND tr.job_track='contractor' AND tr.environment='synthetic_demo'
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=t OR g.scope_kind='team' AND g.scope_id=tm.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id))
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) s WHERE s.tenant_id=t AND s.membership_id=a) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('list','detail') THEN
  PERFORM app.mon8_require_feature(a,'site_origin_capture');
  IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  -- Serialize before taking the job SHARE lock: confirmation may upgrade it via scope writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
  PERFORM app.require_watchdog_live(p_job);
  -- Serializes baseline imports; their UPDATE of work_order_current waits for this lock.
  PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
  IF EXISTS(SELECT 1 FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) WHERE w.tenant_id=t AND w.job_id=p_job AND r.status<>'ordered') THEN RAISE EXCEPTION 'JOB_NOT_LIVE'; END IF;
 END IF;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION app.practice_worker_switch_on(p_session uuid,p_command uuid,p_worker uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; rule record; saved control_plane.practice_worker_switch; marker control_plane.practice_company_marker; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL OR p_worker IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 PERFORM app.mon8_require_feature(live.membership_id,'operative_roles');
 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.command_id=p_command AND saved.session_ref=live.session_ref AND saved.worker_membership_id=p_worker THEN
   replay:=true; SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
   RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
  END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 BEGIN SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(live.session_ref,p_worker);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END;
 IF rule.decision IS NULL OR rule.decision NOT IN('allowed','not_found') THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
 IF FOUND AND (marker.session_ref IS DISTINCT FROM live.session_ref OR marker.owner_membership_id IS DISTINCT FROM live.membership_id OR marker.owner_identity_user_id IS DISTINCT FROM live.identity_user_id)
 THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL)
 THEN RAISE EXCEPTION 'SWITCH_OPEN' USING ERRCODE='55000'; END IF;
 IF rule.decision='not_found' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 reading:=clock_timestamp();
 IF marker.tenant_id IS NULL THEN
  INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at)
   VALUES(rule.company,live.session_ref,rule.owner_member,rule.owner_user,reading) RETURNING * INTO marker;
 END IF;
 INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at)
 VALUES(gen_random_uuid(),live.session_ref,rule.company,rule.owner_member,p_worker,rule.worker_user,p_command,reading,reading+interval '30 minutes') RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
END $$;
CREATE OR REPLACE FUNCTION app.ef_read(p_session uuid,p_derivation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; h app.enterprise_fee_derivation;
BEGIN
 PERFORM app.mon8_retained_fee_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO h FROM app.enterprise_fee_derivation WHERE tenant_id=t AND id=p_derivation;
 IF h.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',h.id,'agreementVersionId',h.agreement_version_id,'period',h.period,
  'recordedCutoff',to_char(h.recorded_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'inputHash',h.input_hash,
  'qualifyingPrincipal',jsonb_build_object('numerator',h.qualifying_numerator::text,'denominator',h.qualifying_denominator::text),
  'cumulativeFeePence',h.cumulative_fee_pence,
  'contributions',coalesce((SELECT jsonb_agg(jsonb_build_object('extraId',c.extra_id,'originKind',c.origin_kind,'exportLineId',c.export_line_id,
   'allocationId',c.allocation_id,'runId',c.run_id,'rule',c.rule,
   'qualifyingPrincipal',jsonb_build_object('numerator',c.qualifying_numerator::text,'denominator',c.qualifying_denominator::text)) ORDER BY c.allocation_id)
   FROM app.enterprise_fee_contribution c WHERE c.tenant_id=t AND c.derivation_id=h.id),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION app.ef_read_statement(p_session uuid,p_statement uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; st app.enterprise_fee_statement;
BEGIN
 PERFORM app.mon8_retained_fee_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO st FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement;
 IF st.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',st.id,'period',st.period,'revision',st.revision,'predecessorId',st.predecessor_id,'contentHash',st.content_hash,
  'totalDeltaPence',st.total_delta_pence,
  'sections',coalesce((SELECT jsonb_agg(jsonb_build_object('agreementVersionId',x.agreement_version_id,'derivationId',x.derivation_id,
   'cumulativeFeePence',x.cumulative_fee_pence,'priorNetPostedPence',x.prior_net_posted_pence,'deltaPence',x.delta_pence) ORDER BY x.agreement_version_id)
   FROM app.enterprise_fee_statement_section x WHERE x.tenant_id=t AND x.statement_id=st.id),'[]'::jsonb),
  'superseded',EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id),
  'dispute',(SELECT jsonb_build_object('reason',reason_code) FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=st.id),
  'approval',(SELECT jsonb_build_object('authorizationId',authorization_id,'expiresAt',to_char(z.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
   FROM app.enterprise_fee_statement_approval p JOIN app.action_authorization z ON(z.tenant_id,z.id)=(p.tenant_id,p.authorization_id) WHERE p.tenant_id=t AND p.statement_id=st.id));
END $$;
CREATE OR REPLACE FUNCTION app.enterprise_baseline_read(p_session uuid,p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb;
BEGIN
 a:=app.mon8_retained_baseline_actor(p_session);
 SELECT b.history INTO h FROM app.enterprise_baseline_batch b WHERE b.tenant_id=t AND b.id=p_batch
  AND EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id))
  AND NOT EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id)
    AND NOT coalesce(app.contractor_allowed(a,'dashboard.read',m.team_id),false));
 IF h IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN h;
END $$;
CREATE OR REPLACE FUNCTION app.lp_visit_evaluate(p_actor uuid,p_job uuid,p_command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
 IF current_database()<>'jobguard_synthetic_demo' OR NOT coalesce(app.contractor_member_active(p_actor),false)
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt r JOIN app.closeout_answer a ON(a.tenant_id,a.command_id)=(r.tenant_id,r.command_id)
   WHERE r.tenant_id=t AND r.command_id=p_command AND r.command_type='CompleteSiteVisit' AND r.status='processing' AND r.actor_membership_id=p_actor AND a.job_id=p_job AND a.membership_id=p_actor)
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 PERFORM app.require_watchdog_live(p_job);
 PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
 RETURN app.lp_evaluate(p_job,p_command);
END $$;
COMMIT;
