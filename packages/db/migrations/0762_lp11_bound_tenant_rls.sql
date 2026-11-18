BEGIN;
-- Forward fix only: keep tenant authority in protected transaction state.
-- An unbound query matches no row. Expired and delegated request checks stay
-- with the existing LP-6 accessors.
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.lp11_policy_tenant() RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF pg_current_xact_id_if_assigned() IS NULL OR NOT app.lp6e_request_binding_present() THEN
  RETURN NULL;
 END IF;
 RETURN app.current_tenant();
END $$;
ALTER FUNCTION app.lp11_policy_tenant() OWNER TO jobguard_binding_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp11_policy_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_policy_tenant() TO jobguard_runtime,jobguard_migration,
 jobguard_identity,jobguard_command_writer,jobguard_audit_writer,jobguard_meter,jobguard_meter_owner,
 jobguard_shadow,jobguard_worm_executor;

-- Worker preflight precedes author validation and also services an expired
-- lease. Its transaction scope comes solely from the committed signal.
-- Keep it separate from the author binding: a preflight is not an approval.
CREATE UNLOGGED TABLE control_plane.lp11_worker_scope (
 transaction_id xid8 PRIMARY KEY,
 action_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 executor name NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE control_plane.lp11_worker_scope OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_worker_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_open_worker_scope(p_action uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid;
BEGIN
 PERFORM app.lp10_assert_worker();
 IF app.lp6e_request_binding_present() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT s.tenant_id INTO t FROM infrastructure.outbox_signal s WHERE s.action_id=p_action;
 IF t IS NULL THEN RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501'; END IF;
 DELETE FROM control_plane.lp11_worker_scope WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.lp11_worker_scope VALUES
  (pg_current_xact_id(),p_action,t,session_user,clock_timestamp()+interval '5 minutes')
 ON CONFLICT(transaction_id) DO NOTHING;
 IF NOT EXISTS(SELECT FROM control_plane.lp11_worker_scope s
  WHERE s.transaction_id=pg_current_xact_id() AND (s.action_id,s.tenant_id,s.executor)=(p_action,t,session_user)) THEN
  RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501';
 END IF;
 RETURN t;
END $$;
ALTER FUNCTION app.lp11_open_worker_scope(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_open_worker_scope(uuid) FROM PUBLIC;

-- The compatibility facade can assert its queued tenant through the worker
-- login. The signal supplies the tenant and the claim reuses this exact scope.
CREATE FUNCTION app.lp11_worker_action_matches(p_action uuid,p_tenant uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM app.lp10_assert_worker();
 IF NOT EXISTS(SELECT FROM infrastructure.outbox_signal s WHERE (s.action_id,s.tenant_id)=(p_action,p_tenant)) THEN
  RETURN false;
 END IF;
 RETURN app.lp11_open_worker_scope(p_action)=p_tenant;
END $$;
ALTER FUNCTION app.lp11_worker_action_matches(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_worker_action_matches(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_worker_action_matches(uuid,uuid) TO jobguard_worker;

CREATE FUNCTION app.lp11_worker_tenant(p_action uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_worker_scope s
 JOIN infrastructure.outbox_signal signal ON (signal.action_id,signal.tenant_id)=(s.action_id,s.tenant_id)
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.executor=session_user
  AND s.expires_at>clock_timestamp() AND (p_action IS NULL OR p_action=s.action_id)
$$;
ALTER FUNCTION app.lp11_worker_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_worker_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_worker_tenant(uuid) TO jobguard_audit_writer,jobguard_runtime;

-- Signup and synthetic contractor bootstrap create their tenant before there
-- can be any member to bind. This permits the first account/membership only
-- for a tenant minted by the same database transaction.
CREATE FUNCTION app.lp11_new_tenant(t uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT NOT app.lp6e_request_binding_present() AND EXISTS(
  SELECT FROM control_plane.tenant x WHERE x.id=t AND x.xmin=pg_current_xact_id_if_assigned()::xid)
$$;
ALTER FUNCTION app.lp11_new_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_new_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_new_tenant(uuid) TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.seed_saved_v1_sample() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE tenant uuid:='11111111-1111-4111-8111-111111111111'; j uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); proposal_id uuid:=gen_random_uuid(); scope uuid; line jsonb; lines jsonb:='[]'; data jsonb; label text; i integer:=0; text_value text:='Generated fictional v1 decorating sample. No real customer data.'; previous_context text;
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest=NEW.token_digest)
  OR EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest=NEW.token_digest)
 THEN RETURN NEW; END IF;

 IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'session fixture requires migration owner' USING ERRCODE='42501'; END IF;
 IF NEW.revoked_at IS NOT NULL OR NEW.expires_at<=clock_timestamp() THEN RETURN NEW; END IF;
 PERFORM app.bind_request('practice',NEW.token_digest::text,tenant);
 previous_context:=current_setting('app.tenant_id',true);PERFORM set_config('app.tenant_id',tenant::text,true);
 INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,saved_v1_sample) VALUES(j,tenant,'Earlier proposed pricing (v1)','draft',NEW.token_digest,'v1_sample',true);
 FOREACH label IN ARRAY ARRAY['Protect room','Prepare walls','Paint walls','Finish trim','Clean site','Replace shelves'] LOOP
  i:=i+1;
  line:=jsonb_build_object('description',jsonb_build_object('value',label,'provenance',jsonb_build_object('kind','human_supplied','note','Generated saved v1 sample')),'quantity',jsonb_build_object('value','1','provenance',jsonb_build_object('kind','defaulted','note','Generated single item')),'unit',jsonb_build_object('value','item','provenance',jsonb_build_object('kind','defaulted','note','Generated item unit')),'unitPricePence',jsonb_build_object('value',CASE WHEN i<=4 THEN to_jsonb(20000) ELSE 'null'::jsonb END,'provenance',jsonb_build_object('kind','human_supplied','note','Generated sample rate or explicitly unknown')));
  lines:=lines||jsonb_build_array(line);
 END LOOP;
 data:=jsonb_build_object('title',jsonb_build_object('value','Earlier proposed pricing (v1)','provenance',jsonb_build_object('kind','human_supplied','note','Generated saved v1 sample')),'lines',lines,'materials','[]'::jsonb,'questions',jsonb_build_array(jsonb_build_object('question',jsonb_build_object('value','Confirm disposal','provenance',jsonb_build_object('kind','human_supplied','note','Generated sample question')))));
 INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES(src,tenant,'text',convert_to(text_value,'UTF8'),text_value,encode(sha256(convert_to(text_value,'UTF8')),'hex'));
 INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal) VALUES(proposal_id,tenant,src,j,src,1,encode(sha256(convert_to(text_value,'UTF8')),'hex'),'saved-v1-sample.v1','job-record-proposal-v1','generated-no-model',data);
 i:=0;FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  i:=i+1;scope:=gen_random_uuid();INSERT INTO app.scope_identity(id,tenant_id,job_id) VALUES(scope,tenant,j);
  INSERT INTO app.proposal_line(id,tenant_id,job_id,scope_item_id,source_hash,source_reference,proposal_id,ordinal,proposed_data) VALUES(gen_random_uuid(),tenant,j,scope,encode(sha256(convert_to(text_value,'UTF8')),'hex'),src::text||':v1',proposal_id,i,line);
 END LOOP;
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.start_contractor_practice(s uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; u uuid; a uuid; m uuid; r uuid; b uuid; team_id uuid; assignment uuid; digest char(64); reading timestamptz; home timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s::text,55));
 -- R4 (PH13): an existing session is read under FOR SHARE without waiting. While its end is in flight
 -- the start refuses at once (the ended-session answer), so the binding that follows never waits on it.
 BEGIN
  SELECT x.tenant_id INTO t FROM control_plane.contractor_practice_session x WHERE x.session_digest=app.contractor_practice_session_digest(s) FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RETURN '00000000-0000-0000-0000-000000000000'::uuid;
 END;
 IF t IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM app.contractor_practice_session_live(s)) THEN RETURN t; END IF;
  RETURN '00000000-0000-0000-0000-000000000000'::uuid;
 END IF;
 digest:=app.contractor_practice_session_digest(s); reading:=clock_timestamp(); home:=app.contractor_practice_home_deadline(digest,reading);
 IF home='-infinity'::timestamptz THEN RETURN '00000000-0000-0000-0000-000000000000'::uuid; END IF;
 t:=gen_random_uuid(); u:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid(); r:=gen_random_uuid(); b:=gen_random_uuid(); team_id:=gen_random_uuid(); assignment:=gen_random_uuid();
 PERFORM set_config('app.tenant_id',t::text,true);
 INSERT INTO control_plane.tenant(id) VALUES(t); INSERT INTO identity.identity_user(id) VALUES(u);
 INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'Fictional contractor');
 INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
 INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES(gen_random_uuid(),t,m,u,digest,reading,LEAST(home,reading+interval '7 days'));
 PERFORM app.bind_request('contractor_practice',s::text,t);
 PERFORM app.assign_commercial_track(t,assignment,'contractor','synthetic-agreement:'||t,0,'operations:synthetic-generator');
 INSERT INTO app.contractor_member VALUES(t,m,NULL,'owner@fictional.invalid');
 INSERT INTO app.org_unit VALUES(t,t,'tenant',NULL,NULL,'Fictional contractor'),(t,r,'region',t,'tenant','Fictional region'),(t,b,'branch',r,'region','Fictional branch');
 INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,team_id,b,'Fictional team');
 INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),m,'owner','tenant',t,NULL);
 RETURN t;
END $$;

CREATE OR REPLACE FUNCTION app.lp10_lock_action(p_action uuid) RETURNS app.action_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid; item app.action_outbox;
BEGIN
 t:=app.lp11_open_worker_scope(p_action);
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO item FROM app.action_outbox o WHERE (o.tenant_id,o.id)=(t,p_action) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN item;
END $$;

CREATE OR REPLACE FUNCTION app.record_worker_recovery_message(p_action uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; t uuid; recovery_case uuid; practice_digest text;
 saved_tenant text:=current_setting('app.tenant_id',true);
 saved_material_digest text:=current_setting('app.practice_material_digest',true);
BEGIN
 PERFORM app.lp10_assert_worker();
 IF app.lp6e_request_binding_present() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=app.lp11_open_worker_scope(p_action);
 PERFORM set_config('app.tenant_id',coalesce(t::text,''),true);
 SELECT a.case_id,j.practice_session_digest INTO recovery_case,practice_digest
 FROM app.recovery_message_approval a
 JOIN app.job j ON (j.tenant_id,j.id)=(a.tenant_id,a.job_id)
 WHERE (a.tenant_id,a.outbox_action_id)=(t,p_action);
 IF recovery_case IS NULL THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 -- Match recovery commands: lock the case and evidence sources before outbox rows.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(recovery_case::text));
 PERFORM app.lock_recovery_message_sources(t);
 item:=app.lp10_lock_action(p_action);
 IF item.adapter IS DISTINCT FROM 'fake_recovery_message' OR item.status IS DISTINCT FROM 'executing'
  OR item.claimed_at IS NULL OR item.claimed_at<clock_timestamp()-interval '5 minutes'
  OR app.lp10_action_author(item) IS NULL OR item.authorization_expires_at<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM app.action_attempt a WHERE (a.tenant_id,a.action_id)=(t,p_action) AND a.outcome='started') THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514';
 END IF;
 PERFORM app.bind_worker_action(p_action);
 -- The approved job owns the catalogue scope used by the existing source check.
 PERFORM set_config('app.practice_material_digest',coalesce(practice_digest,''),true);
 BEGIN
  PERFORM app.lp6d_recovery_message_sink_worker(p_action,'fake-recovery:'||p_action::text);
 EXCEPTION WHEN unique_violation THEN
  IF NOT EXISTS(SELECT 1 FROM app.recovery_message_sink
   WHERE (tenant_id,outbox_action_id,provider_reference)=(t,p_action,'fake-recovery:'||p_action::text)) THEN
   RAISE;
  END IF;
 END;
 PERFORM set_config('app.practice_material_digest',coalesce(saved_material_digest,''),true);
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
END $$;

-- Recovery delivery rechecks the approved case and its job's source records
-- while the committed action, live worker claim and stored approval agree.
CREATE FUNCTION app.lp11_recovery_worker_tenant(j uuid,c uuid,m uuid,reference uuid,kind text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT a.tenant_id FROM control_plane.lp11_worker_scope w
 JOIN control_plane.worker_action_binding b ON(b.transaction_id,b.action_id,b.tenant_id,b.executor)
  =(w.transaction_id,w.action_id,w.tenant_id,w.executor)
 JOIN app.recovery_message_approval a ON(a.tenant_id,a.outbox_action_id)=(w.tenant_id,w.action_id)
 WHERE w.transaction_id=pg_current_xact_id_if_assigned() AND w.executor=session_user
  AND b.expires_at>clock_timestamp() AND w.tenant_id=app.lp11_worker_tenant(w.action_id)
  AND (j IS NULL OR a.job_id=j) AND (c IS NULL OR a.case_id=c) AND (m IS NULL OR a.message_id=m)
  AND CASE kind
   WHEN 'row' THEN j IS NOT NULL OR c IS NOT NULL OR m IS NOT NULL
   WHEN 'evidence' THEN EXISTS(SELECT 1 FROM app.evidence_object e
    WHERE (e.tenant_id,e.job_id,e.id)=(a.tenant_id,a.job_id,reference))
   WHEN 'allocation' THEN EXISTS(SELECT 1 FROM app.landing_allocation l
    WHERE (l.tenant_id,l.job_id,l.case_id,l.id)=(a.tenant_id,a.job_id,a.case_id,reference))
   ELSE false END
$$;
ALTER FUNCTION app.lp11_recovery_worker_tenant(uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_recovery_worker_tenant(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_recovery_worker_tenant(uuid,uuid,uuid,uuid,text) TO jobguard_runtime;

-- Credential routines can open a lookup only after selecting a live session
-- or an identity locator. The scope is private to the NOLOGIN lookup owner.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_session_lookup') THEN
  RAISE EXCEPTION 'jobguard_session_lookup missing; provision the lookup owner' USING ERRCODE='42704';
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_session_lookup'
  AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit OR rolcanlogin))
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
  WHERE m.member='jobguard_session_lookup'::regrole OR
   (m.roleid='jobguard_session_lookup'::regrole AND NOT (
    (m.member=session_user::regrole AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND g.rolsuper)
    OR (m.member='jobguard_migration'::regrole AND current_user='jobguard_migration'
     AND NOT m.admin_option AND m.inherit_option AND m.set_option AND m.grantor=session_user::regrole)))) THEN
  RAISE EXCEPTION 'unsafe lookup owner posture' USING ERRCODE='42501';
 END IF;
END $$;

GRANT USAGE,CREATE ON SCHEMA app,identity,control_plane TO jobguard_session_lookup;
CREATE UNLOGGED TABLE control_plane.lp11_identity_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid,
 session_id uuid
);
ALTER TABLE control_plane.lp11_identity_scope OWNER TO jobguard_session_lookup;
REVOKE ALL ON control_plane.lp11_identity_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_set_identity_scope(t uuid,s uuid) RETURNS void
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
 INSERT INTO control_plane.lp11_identity_scope VALUES(pg_current_xact_id(),t,s)
 ON CONFLICT(transaction_id) DO UPDATE SET tenant_id=excluded.tenant_id,session_id=excluded.session_id
$$;
ALTER FUNCTION app.lp11_set_identity_scope(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_set_identity_scope(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION app.lp11_identity_scope() RETURNS control_plane.lp11_identity_scope
 LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s FROM control_plane.lp11_identity_scope s WHERE s.transaction_id=pg_current_xact_id_if_assigned()
$$;
ALTER FUNCTION app.lp11_identity_scope() OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_identity_scope() FROM PUBLIC;

GRANT SELECT ON app.account,app.membership,app.contractor_membership_revocation,app.contractor_member,
 identity.sso_subject,identity.sso_session_binding,identity.sso_required_event,identity.sso_emergency_window,
 identity.session,identity.user_email,identity.membership_locator,
 control_plane.practice_session,control_plane.contractor_practice_session TO jobguard_session_lookup;
-- PostgreSQL requires an UPDATE column privilege for the existing credential
-- locks. Business membership, account and revocation receive SELECT only.
GRANT UPDATE (id) ON identity.session TO jobguard_session_lookup;
GRANT UPDATE (token_digest) ON control_plane.practice_session TO jobguard_session_lookup;
GRANT UPDATE (session_id) ON control_plane.contractor_practice_session TO jobguard_session_lookup;

DO $$ DECLARE rel regclass; BEGIN
 FOREACH rel IN ARRAY ARRAY['app.account','app.membership','app.contractor_membership_revocation','app.contractor_member',
  'identity.sso_subject','identity.sso_required_event','identity.sso_emergency_window']::regclass[] LOOP
  EXECUTE format('CREATE POLICY lp11_credential_lookup ON %s FOR SELECT TO jobguard_session_lookup
   USING (tenant_id=coalesce((app.lp11_identity_scope()).tenant_id,
    app.lp11_policy_tenant()))',rel);
 END LOOP;
END $$;
CREATE POLICY lp11_credential_lookup ON identity.sso_session_binding FOR SELECT TO jobguard_session_lookup
 USING (session_id=(app.lp11_identity_scope()).session_id);

CREATE OR REPLACE FUNCTION identity.current_memberships(u uuid)
 RETURNS TABLE(id uuid, identity_user_id uuid, tenant_id uuid, role varchar, email varchar, name varchar)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE link identity.membership_locator;
BEGIN
 FOR link IN SELECT * FROM identity.membership_locator WHERE user_id=u LOOP
  PERFORM app.lp11_set_identity_scope(link.tenant_id,NULL);
  RETURN QUERY SELECT m.id,m.identity_user_id,m.tenant_id,m.role,e.email,a.name
   FROM app.membership m JOIN app.account a ON(a.tenant_id,a.id)=(m.tenant_id,m.account_id)
   JOIN identity.user_email e ON e.user_id=m.identity_user_id
   WHERE m.tenant_id=link.tenant_id AND m.id=link.membership_id AND m.identity_user_id=u
   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
    WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id);
 END LOOP;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;

CREATE OR REPLACE FUNCTION identity.sso_required_state(t uuid)
 RETURNS TABLE(required boolean,connection_id uuid,revision integer,event_id uuid,actor_kind text,
 window_opened_at timestamptz,window_closes_at timestamptz,window_minutes integer,window_open boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE latest identity.sso_required_event; window_row identity.sso_emergency_window; is_open boolean:=false; prior control_plane.lp11_identity_scope; BEGIN
 IF t IS NULL OR ((app.lp11_identity_scope()).tenant_id IS DISTINCT FROM t
  AND app.lp11_policy_tenant() IS DISTINCT FROM t
  AND app.lp11_sso_tenant(ARRAY['dark_emergency','mailbox_emergency'],NULL) IS DISTINCT FROM t)
 THEN RAISE EXCEPTION 'SSO_REQUIRED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 prior:=app.lp11_identity_scope();
 PERFORM app.lp11_set_identity_scope(t,prior.session_id);
 SELECT * INTO latest FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
 IF latest.actor_kind='emergency' THEN
  SELECT * INTO window_row FROM identity.sso_emergency_window w WHERE w.tenant_id=t AND w.event_id=latest.id;
  is_open:=coalesce(clock_timestamp()<window_row.closes_at,false);
 END IF;
 PERFORM app.lp11_set_identity_scope(prior.tenant_id,prior.session_id);
 RETURN QUERY SELECT (CASE WHEN latest.id IS NULL THEN false WHEN latest.required IS TRUE THEN true
  WHEN latest.required IS FALSE AND latest.actor_kind='admin' THEN false ELSE NOT is_open END),
  latest.connection_id,coalesce(latest.revision,0),latest.id,latest.actor_kind,
  window_row.opened_at,window_row.closes_at,window_row.window_minutes,is_open;
END $$;

CREATE FUNCTION identity.lp11_sso_session_memberships(u uuid,s uuid)
 RETURNS TABLE(id uuid,identity_user_id uuid,tenant_id uuid,role varchar,email varchar,name varchar)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; needed boolean; binding identity.sso_session_binding; BEGIN
 -- Positive binding lookup uses the merged session-specific bootstrap policy before any tenant loop.
 -- If that lookup is hidden, a later tenant policy cannot reinterpret the session as ordinarily authorized.
 PERFORM app.lp11_set_identity_scope(NULL,(SELECT se.id FROM identity.session se WHERE se.id=s AND se.user_id=u));
 SELECT * INTO binding FROM identity.sso_session_binding b WHERE b.session_id=s;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  PERFORM app.lp11_set_identity_scope(member.tenant_id,binding.session_id);
  SELECT coalesce(bool_or(e.required),true) INTO needed FROM identity.sso_required_state(member.tenant_id) e;
  IF coalesce(needed,false)=false OR (binding.session_id=s AND binding.tenant_id=member.tenant_id AND EXISTS(
   SELECT 1 FROM identity.sso_subject sub
    WHERE (sub.tenant_id,sub.connection_id,sub.subject_hash)=(binding.tenant_id,binding.connection_id,binding.subject_hash)
     AND sub.user_id=u AND sub.membership_id=member.id))
  THEN RETURN QUERY SELECT member.id,member.identity_user_id,member.tenant_id,member.role,member.email,member.name; END IF;
 END LOOP;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;
ALTER FUNCTION identity.lp11_sso_session_memberships(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION identity.lp11_sso_session_memberships(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lp11_sso_session_memberships(uuid,uuid) TO jobguard_migration;
GRANT EXECUTE ON FUNCTION identity.sso_session_memberships(uuid,uuid) TO jobguard_session_lookup;

CREATE OR REPLACE FUNCTION identity.sso_session_memberships(u uuid,s uuid)
 RETURNS TABLE(id uuid,identity_user_id uuid,tenant_id uuid,role varchar,email varchar,name varchar) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY SELECT * FROM identity.lp11_sso_session_memberships(u,s);
END $$;

CREATE FUNCTION identity.lp11_sso_code_signin_allowed(u uuid)
 RETURNS TABLE(allowed boolean,connections uuid[]) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; needed boolean; c uuid; active_count integer:=0; ordinary_count integer:=0; targets uuid[]:='{}'; BEGIN
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  active_count:=active_count+1; PERFORM app.lp11_set_identity_scope(member.tenant_id,NULL);
  SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(member.tenant_id) e;
  IF coalesce(needed,false) THEN targets:=array_append(targets,c); ELSE ordinary_count:=ordinary_count+1; END IF;
 END LOOP;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN QUERY SELECT active_count=0 OR ordinary_count>0,targets;
END $$;
ALTER FUNCTION identity.lp11_sso_code_signin_allowed(uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION identity.lp11_sso_code_signin_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lp11_sso_code_signin_allowed(uuid) TO jobguard_migration;
GRANT EXECUTE ON FUNCTION identity.sso_code_signin_allowed(uuid) TO jobguard_session_lookup;

CREATE OR REPLACE FUNCTION identity.sso_code_signin_allowed(u uuid)
 RETURNS TABLE(allowed boolean,connections uuid[]) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY SELECT * FROM identity.lp11_sso_code_signin_allowed(u);
END $$;

CREATE FUNCTION identity.lp11_sso_required_refusal_target(u uuid,t uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; c uuid; BEGIN
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  IF member.tenant_id=t THEN
   PERFORM app.lp11_set_identity_scope(member.tenant_id,NULL);
   SELECT e.connection_id INTO c FROM identity.sso_required_state(t) e WHERE e.required IS NOT FALSE;
   DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
   RETURN c;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
ALTER FUNCTION identity.lp11_sso_required_refusal_target(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION identity.lp11_sso_required_refusal_target(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lp11_sso_required_refusal_target(uuid,uuid) TO jobguard_migration;
GRANT EXECUTE ON FUNCTION identity.sso_required_refusal_target(uuid,uuid) TO jobguard_session_lookup;

CREATE OR REPLACE FUNCTION identity.sso_required_refusal_target(u uuid,t uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN identity.lp11_sso_required_refusal_target(u,t);
END $$;

-- Invite issuance can report the configured SSO connection only after checking
-- the exact active session and its current membership in the requested company.
CREATE FUNCTION identity.lp11_invitation_sso_state(d char(64),t uuid)
 RETURNS TABLE(required boolean,connection_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u uuid;
BEGIN
 SELECT s.user_id INTO u FROM identity.session s
 WHERE s.token_digest=d AND s.environment='synthetic_demo'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM identity.current_memberships(u) m WHERE m.tenant_id=t) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 PERFORM app.lp11_set_identity_scope(t,NULL);
 RETURN QUERY SELECT e.required,e.connection_id FROM identity.sso_required_state(t) e;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;
ALTER FUNCTION identity.lp11_invitation_sso_state(char,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION identity.lp11_invitation_sso_state(char,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lp11_invitation_sso_state(char,uuid) TO jobguard_migration;

CREATE OR REPLACE FUNCTION identity.sso_invite_member(session_digest char(64),t uuid,recipient varchar,assigned_role varchar)
 RETURNS TABLE(id uuid,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE needed boolean; c uuid; BEGIN
 SELECT e.required,e.connection_id INTO needed,c FROM identity.lp11_invitation_sso_state(session_digest,t) e;
 IF coalesce(needed,false) THEN RETURN QUERY SELECT NULL::uuid,c; RETURN; END IF;
 RETURN QUERY SELECT identity.invite_member(session_digest,t,recipient,assigned_role),NULL::uuid;
END $$;

CREATE FUNCTION identity.lp11_sso_invitation_accept_allowed(invitation uuid)
 RETURNS TABLE(allowed boolean,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; needed boolean; c uuid; BEGIN
 SELECT i.tenant_id INTO t FROM identity.invitation i WHERE i.id=invitation;
 IF t IS NULL THEN RETURN QUERY SELECT true,NULL::uuid; RETURN; END IF;
 PERFORM app.lp11_set_identity_scope(t,NULL);
 SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(t) e;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN QUERY SELECT NOT coalesce(needed,false),(CASE WHEN needed THEN c ELSE NULL::uuid END);
END $$;
ALTER FUNCTION identity.lp11_sso_invitation_accept_allowed(uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION identity.lp11_sso_invitation_accept_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lp11_sso_invitation_accept_allowed(uuid) TO jobguard_migration;
GRANT EXECUTE ON FUNCTION identity.sso_invitation_accept_allowed(uuid) TO jobguard_session_lookup;

CREATE OR REPLACE FUNCTION identity.sso_invitation_accept_allowed(invitation uuid)
 RETURNS TABLE(allowed boolean,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY SELECT * FROM identity.lp11_sso_invitation_accept_allowed(invitation);
END $$;

GRANT SELECT ON identity.invitation TO jobguard_session_lookup;
GRANT EXECUTE ON FUNCTION identity.sso_invitation_accept_allowed(uuid) TO jobguard_migration;

CREATE OR REPLACE FUNCTION identity.sso_session_scope(s uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; binding record; BEGIN
 -- Session UUID is obtained only after opaque-token authentication, never a web selector.
 PERFORM app.lp11_set_identity_scope(NULL,s);
 SELECT * INTO binding FROM identity.sso_session_binding WHERE session_id=s;
 PERFORM app.lp11_set_identity_scope(binding.tenant_id,binding.session_id);
 IF binding.session_id IS NOT NULL THEN PERFORM set_config('app.tenant_id',binding.tenant_id::text,true); END IF;
 IF binding.session_id IS NULL THEN
  DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN NULL;
 END IF;
 SELECT jsonb_build_object('tenantId',b.tenant_id,'membershipId',sub.membership_id,'connectionId',b.connection_id) INTO result FROM identity.sso_session_binding b
  JOIN identity.sso_subject sub ON(sub.tenant_id,sub.connection_id,sub.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash)
  WHERE b.session_id=s AND app.contractor_member_active(sub.membership_id)
  AND EXISTS(SELECT 1 FROM identity.session se WHERE se.id=s AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp() AND se.environment='synthetic_demo');
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN coalesce(result,'{"revoked":true}'::jsonb);
END $$;

-- The lookup owner receives only the classification of a supplied digest.
-- The associations themselves remain private to the migration owner.
CREATE FUNCTION app.lp11_practice_digest_kind(d text) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN d ~ '^[0-9a-f]{64}$' THEN
  CASE WHEN EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest=d) THEN 'namespace'
   WHEN EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest=d) THEN 'credential'
   END
 END
$$;
ALTER FUNCTION app.lp11_practice_digest_kind(text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_practice_digest_kind(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_practice_digest_kind(text) TO jobguard_session_lookup;

CREATE OR REPLACE FUNCTION app.lp6_session_authority(p_kind text,p_credential text,p_tenant uuid)
 RETURNS TABLE(session_ref text,actor_id uuid,expires_at timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE linked record; real_session identity.session; home control_plane.practice_session;
 practice control_plane.contractor_practice_session; selected_actor uuid;
 selected_ref text; deadline timestamptz; practice_kind text; saved_tenant text:=current_setting('app.tenant_id',true);
 saved_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 IF p_kind='practice' THEN practice_kind:=app.lp11_practice_digest_kind(p_credential); END IF;
 IF practice_kind='namespace' THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF practice_kind='credential' THEN
  IF p_tenant IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
  BEGIN
   SELECT * INTO linked FROM app.linked_practice_authority(p_credential);
  EXCEPTION WHEN invalid_authorization_specification THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END;
  SELECT a.membership_id INTO selected_actor FROM app.anonymous_practice_authority(p_credential,p_tenant) a;
  IF selected_actor IS NULL THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT encode(sha256(convert_to('lp6-home:'||linked.owner_digest,'UTF8')),'hex'),selected_actor,linked.deadline;
  RETURN;
 END IF;
 IF p_tenant IS NULL OR p_kind IS NULL OR p_credential IS NULL THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_kind='real' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO real_session FROM identity.session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR real_session.revoked_at IS NOT NULL OR real_session.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM identity.sso_session_memberships(real_session.user_id,real_session.id) m
   WHERE m.tenant_id=p_tenant;
  selected_ref:=real_session.id::text; deadline:=real_session.expires_at;
 ELSIF p_kind='practice' AND current_database()='jobguard_synthetic_demo' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO home FROM control_plane.practice_session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR home.environment<>'synthetic_demo' OR home.revoked_at IS NOT NULL OR home.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- Existing home principal mapping, never an identity.session lookup.
  SELECT m.membership_id INTO selected_actor FROM app.authenticate_practice_session(p_credential,p_tenant) m;
  selected_ref:=encode(sha256(convert_to('lp6-home:'||p_credential,'UTF8')),'hex'); deadline:=home.expires_at;
 ELSIF p_kind='contractor_practice' AND current_database()='jobguard_synthetic_demo'
  AND p_credential ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  SELECT * INTO practice FROM control_plane.contractor_practice_session s
   WHERE s.session_digest=app.contractor_practice_session_digest(p_credential::uuid) FOR SHARE;
  IF NOT FOUND OR practice.tenant_id IS DISTINCT FROM p_tenant OR practice.revoked_at IS NOT NULL
   OR practice.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- If contractor practice originated at home, revoke/expiry of home also wins.
  -- No home lock: avoid a second, differently ordered credential-row lock.
  deadline:=LEAST(practice.expires_at,app.contractor_practice_home_deadline(practice.session_digest,clock_timestamp()));
  PERFORM app.lp11_set_identity_scope(p_tenant,NULL);
  -- A switch must not revive the base owner's revoked or expired membership.
  IF NOT EXISTS(SELECT 1 FROM app.membership base
   WHERE (base.tenant_id,base.id,base.identity_user_id)=(p_tenant,practice.membership_id,practice.identity_user_id)
    AND base.revoked_at IS NULL AND (base.expires_at IS NULL OR base.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(base.tenant_id,base.id))) THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM app.lp6d_contractor_session_identity(p_credential::uuid) effective
   JOIN app.membership m ON (m.tenant_id,m.id,m.identity_user_id)=(effective.tenant_id,effective.membership_id,effective.identity_user_id)
   WHERE m.tenant_id=p_tenant
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
  selected_ref:=practice.session_id::text;
 ELSE
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF selected_actor IS NULL OR deadline IS NULL OR deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN QUERY SELECT selected_ref,selected_actor,deadline;
END $$;

CREATE FUNCTION app.lp11_lock_practice_approval(digest text,requested_tenant uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_setting('app.evidence_pack_approval_fence',true)='on' THEN
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM requested_tenant::text THEN RETURN false; END IF;
 -- Lock order: session, then the fixed practice membership. Lock by identity
 -- first; evaluate mutable permission/deadlines in a fresh statement after ALL
 -- waits so neither a committed revocation nor elapsed expiry is overlooked.
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=digest FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- FOR SHARE uses the tenant's existing UPDATE RLS policy. The approval path
 -- above requires that matching context; no bootstrap RLS policy is expanded.
  PERFORM 1 FROM app.membership m WHERE m.tenant_id=requested_tenant
   AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
   AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;
ALTER FUNCTION app.lp11_lock_practice_approval(text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_lock_practice_approval(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_lock_practice_approval(text,uuid) TO jobguard_session_lookup;


CREATE OR REPLACE FUNCTION app.anonymous_practice_authority(digest text, requested_tenant uuid DEFAULT '11111111-1111-4111-8111-111111111111'::uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bound_tenant uuid:=app.lp11_policy_tenant();
BEGIN
 IF NOT app.lp11_lock_practice_approval(digest,requested_tenant) THEN RETURN; END IF;
 IF requested_tenant NOT IN ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid)
 OR current_database()<>'jobguard_synthetic_demo'
 OR NOT EXISTS(SELECT FROM control_plane.practice_session s WHERE s.token_digest=digest
  AND s.environment='synthetic_demo' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RETURN; END IF;
 IF bound_tenant IS NOT NULL THEN
  IF requested_tenant IS DISTINCT FROM bound_tenant THEN RETURN; END IF;
 ELSE
  PERFORM app.lp11_set_identity_scope(requested_tenant,NULL);
 END IF;
 RETURN QUERY
 SELECT m.tenant_id,m.id,m.identity_user_id FROM control_plane.practice_session s
 JOIN app.membership m ON m.tenant_id=requested_tenant
  AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
  AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
 WHERE s.token_digest=digest AND s.environment='synthetic_demo'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
 IF bound_tenant IS NULL THEN DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned(); END IF;
END $$;

-- The new owner has neither a runtime membership nor authority to issue bindings.
ALTER FUNCTION app.lp6_session_authority(text,text,uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.current_memberships(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_required_state(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_session_scope(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION app.anonymous_practice_authority(text,uuid) OWNER TO jobguard_session_lookup;
GRANT EXECUTE ON FUNCTION app.lp6_session_authority(text,text,uuid), app.anonymous_practice_authority(text,uuid),
 identity.current_memberships(uuid),identity.sso_session_memberships(uuid,uuid),identity.sso_required_state(uuid),
 identity.sso_session_scope(uuid),identity.sso_code_signin_allowed(uuid),identity.sso_required_refusal_target(uuid,uuid)
 TO jobguard_migration;
GRANT EXECUTE ON FUNCTION app.lp11_policy_tenant() TO jobguard_session_lookup;
GRANT EXECUTE ON FUNCTION app.linked_practice_authority(text),app.authenticate_practice_session(text,uuid),app.contractor_member_active(uuid),
 app.lp6d_contractor_session_identity(uuid),app.contractor_practice_session_digest(uuid),
 app.contractor_practice_home_deadline(character,timestamptz) TO jobguard_session_lookup;
REVOKE CREATE ON SCHEMA app,identity,control_plane FROM jobguard_session_lookup;

-- A checked identity operation may need tenant-owned rows before it can issue
-- a session. Only the existing connection-keyed SQL entry points open this
-- scope, and they close it before returning to the identity login.
CREATE UNLOGGED TABLE control_plane.lp11_sso_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid,
 authority_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('cache','complete','scim','audit','worker_authorize','dark_emergency','mailbox_emergency','scim2_configure','scim2_lookup','scim2_machine')),
 login name NOT NULL,
 emergency_actor uuid,
 emergency_event text,
 emergency_subject uuid,
 scim_connection uuid,
 CHECK((operation='scim2_lookup')=(tenant_id IS NULL)),
 CHECK((operation IN ('dark_emergency','mailbox_emergency','scim2_configure'))=(emergency_actor IS NOT NULL))
);
ALTER TABLE control_plane.lp11_sso_scope OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_sso_scope FROM PUBLIC;

CREATE FUNCTION identity.lp11_open_sso_scope(c uuid, operation text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid; connection jsonb;
BEGIN
 IF operation='scim' AND pg_has_role(session_user,'jobguard_scim','USAGE') THEN
  -- Only the machine's checked binding can enter the existing revocation routine.
  UPDATE control_plane.lp11_sso_scope scope SET operation='scim',authority_id=c,scim_connection=NULL
   WHERE scope.transaction_id=pg_current_xact_id_if_assigned() AND scope.login=session_user
    AND scope.operation='scim2_machine' AND scope.scim_connection=c
   RETURNING scope.tenant_id INTO t;
  IF FOUND THEN RETURN t; END IF;
 END IF;
 IF NOT pg_has_role(session_user,'jobguard_identity','USAGE') THEN
  RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 connection:=identity.sso_load_connection(c);
 t:=(CASE WHEN connection->>'protocol'='oidc' THEN connection#>>'{config,tenantId}'
          ELSE connection->>'tenantId' END)::uuid;
 IF t IS NULL THEN RAISE EXCEPTION 'SSO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF app.lp6e_request_binding_present() THEN
  IF t IS DISTINCT FROM app.current_tenant() THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  INSERT INTO control_plane.lp11_sso_scope(transaction_id,tenant_id,authority_id,operation,login)
  VALUES(pg_current_xact_id(),t,c,operation,session_user);
 END IF;
 RETURN t;
END $$;
ALTER FUNCTION identity.lp11_open_sso_scope(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.lp11_open_sso_scope(uuid,text) FROM PUBLIC;

CREATE FUNCTION app.lp11_sso_tenant(operations text[], connection uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_sso_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND s.operation=ANY(operations) AND (connection IS NULL OR s.authority_id=connection)
$$;
ALTER FUNCTION app.lp11_sso_tenant(text[],uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_sso_tenant(text[],uuid) FROM PUBLIC;
-- These callers share policies with migration-owned routines. An ordinary
-- request has no row in the private scope, even when it is already bound.
GRANT EXECUTE ON FUNCTION app.lp11_sso_tenant(text[],uuid) TO jobguard_runtime,jobguard_identity,jobguard_audit_writer,jobguard_session_lookup;

-- The dual-owner emergency route deliberately works during an SSO outage.
-- Prove its existing session and CSRF before reading company-owned rows.
CREATE OR REPLACE FUNCTION identity.emergency_owner(s text, csrf text, t uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x identity.session; a uuid; bound_tenant uuid:=app.lp11_policy_tenant(); BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT pg_has_role(session_user,'jobguard_identity','USAGE')
  OR t IS NULL OR (bound_tenant IS NOT NULL AND bound_tenant IS DISTINCT FROM t)
 THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO x FROM identity.session se WHERE se.token_digest=s AND se.csrf_token=csrf
  AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp() AND se.environment='synthetic_demo' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO a FROM identity.current_memberships(x.user_id) m WHERE m.tenant_id=t AND m.role='owner';
 IF a IS NULL OR (bound_tenant IS NOT NULL AND a IS DISTINCT FROM app.current_actor())
 THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.lp11_sso_scope(transaction_id,tenant_id,authority_id,operation,login,emergency_actor)
 VALUES(pg_current_xact_id(),t,x.id,'dark_emergency',session_user,a);
 PERFORM 1 FROM app.membership m WHERE (m.tenant_id,m.id,m.identity_user_id)=(t,a,x.user_id)
  AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND OR x.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;

CREATE FUNCTION app.lp11_identity_operation_audit_tenant(event text,kind text,subject text,actor text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_sso_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND (s.emergency_event,s.emergency_subject::text)=(event,subject)
  AND CASE s.operation
   WHEN 'dark_emergency' THEN actor='membership:'||s.emergency_actor::text
    AND kind=CASE WHEN event='sso.emergency.notices' THEN 'membership' ELSE 'emergency_request' END
   WHEN 'scim2_configure' THEN actor='membership:'||s.emergency_actor::text AND kind='scim_binding'
   WHEN 'scim2_machine' THEN actor='machine:scim:'||s.authority_id::text AND kind='scim_binding'
   ELSE false END
$$;
ALTER FUNCTION app.lp11_identity_operation_audit_tenant(text,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_identity_operation_audit_tenant(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_identity_operation_audit_tenant(text,text,text,text) TO jobguard_audit_writer;

CREATE OR REPLACE FUNCTION identity.dark_emergency(s text, csrf text, t uuid, p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; u uuid; r identity.emergency_request; op text:=p->>'operation'; rid uuid;
 now_ts timestamptz; notices jsonb; result jsonb; target uuid; raw_token text; previous_context text:=current_setting('app.tenant_id',true); BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 a:=identity.emergency_owner(s,csrf,t);
 PERFORM set_config('app.tenant_id',t::text,true);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'emergency.v1'
 OR (p-ARRAY['version','operation','requestId','reasonHash','token','targetMembershipId'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 IF op='notices' THEN
  -- All owners see every action, including approvals, opening, and subsequent use. No dismiss/delete path.
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('ownerName',n.email) ORDER BY e.created_at,e.id),'[]'::jsonb) INTO notices
   FROM identity.emergency_action e JOIN app.membership m ON(m.tenant_id,m.id)=(e.tenant_id,e.actor)
   JOIN identity.user_email n ON n.user_id=m.identity_user_id WHERE e.tenant_id=t;
  UPDATE control_plane.lp11_sso_scope SET emergency_event='sso.emergency.notices',emergency_subject=a
   WHERE transaction_id=pg_current_xact_id_if_assigned();
  PERFORM app.ef_audit(a,'sso.emergency.notices','membership',a,
   jsonb_build_object('references',jsonb_build_object('membershipId',a::text),'classifications',jsonb_build_object('data','security')));
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
  RETURN jsonb_build_object('notices',notices);
 END IF;
 rid:=(p->>'requestId')::uuid;
 IF rid IS NULL THEN RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 now_ts:=clock_timestamp();
 SELECT * INTO r FROM identity.emergency_request WHERE tenant_id=t AND id=rid;
 IF op='request' THEN
  IF r.id IS NOT NULL OR coalesce(p->>'reasonHash','') !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'EMERGENCY_REPLAY' USING ERRCODE='23505'; END IF;
  INSERT INTO identity.emergency_request VALUES(t,rid,a,p->>'reasonHash',now_ts,now_ts+interval '15 minutes');
 ELSIF r.id IS NULL THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501';
 ELSIF op IN('approve','open') THEN
  IF r.expires_at<=now_ts OR EXISTS(SELECT 1 FROM identity.emergency_session WHERE tenant_id=t AND request_id=rid)
   THEN RAISE EXCEPTION 'EMERGENCY_EXPIRED_OR_USED' USING ERRCODE='42501'; END IF;
  IF op='approve' THEN
   SELECT identity_user_id INTO u FROM app.membership WHERE tenant_id=t AND id=a;
   IF a=r.requester OR EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=r.requester AND identity_user_id=u)
    THEN RAISE EXCEPTION 'EMERGENCY_SELF_APPROVAL' USING ERRCODE='42501'; END IF;
   INSERT INTO identity.emergency_approval VALUES(t,rid,a,u);
  ELSE
   IF a<>r.requester OR p ? 'token'
    OR (SELECT count(DISTINCT ap.approver_user) FROM identity.emergency_approval ap JOIN app.membership m
      ON(m.tenant_id,m.id,m.identity_user_id)=(ap.tenant_id,ap.approver,ap.approver_user)
      WHERE ap.tenant_id=t AND ap.request_id=rid AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>now_ts)
      AND m.id<>r.requester AND m.identity_user_id<>(SELECT identity_user_id FROM app.membership WHERE tenant_id=t AND id=r.requester))<2
    THEN RAISE EXCEPTION 'EMERGENCY_TWO_OWNERS_REQUIRED' USING ERRCODE='42501'; END IF;
   -- Two independently generated UUIDv4 values provide 244 random bits without an extension or new grants.
   raw_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
   INSERT INTO identity.emergency_session VALUES(t,rid,encode(sha256(convert_to(raw_token,'UTF8')),'hex'),now_ts,now_ts+interval '1 hour');
   result:=jsonb_build_object('expiresAt',now_ts+interval '1 hour','token',raw_token);
  END IF;
 ELSIF op IN('inspect','revoke_member') THEN
  IF a<>r.requester OR coalesce(p->>'token','') !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM identity.emergency_session WHERE tenant_id=t AND request_id=rid
    AND token_hash=encode(sha256(convert_to(p->>'token','UTF8')),'hex') AND expires_at>now_ts)
   THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
  IF op='inspect' THEN
   SELECT jsonb_build_object('required',required,'revision',revision) INTO result FROM identity.sso_required_state(t);
  ELSE
   target:=(p->>'targetMembershipId')::uuid;
   -- Restricted recovery only: never change an owner, journals, evidence, Decisions or the SSO-required switch.
   IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=target AND role<>'owner' AND revoked_at IS NULL)
    THEN RAISE EXCEPTION 'EMERGENCY_OWNER_PROTECTED' USING ERRCODE='42501'; END IF;
   UPDATE app.membership SET revoked_at=now_ts WHERE tenant_id=t AND id=target AND role<>'owner';
   INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id)
    SELECT t,gen_random_uuid(),g.id FROM app.role_grant g WHERE g.tenant_id=t AND g.membership_id=target
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.id);
  END IF;
 ELSE RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO identity.emergency_action(tenant_id,id,request_id,actor,operation) VALUES(t,gen_random_uuid(),rid,a,op);
 -- Final lock: effect, visible notice and chain seal commit atomically. Audit failure rolls everything back.
 UPDATE control_plane.lp11_sso_scope SET emergency_event='sso.emergency.'||op,emergency_subject=rid
  WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM app.ef_audit(a,'sso.emergency.'||op,'emergency_request',rid,
  jsonb_build_object('references',jsonb_build_object('requestId',rid::text),'hashes',jsonb_build_object('request',app.final_lock_hash(p)),
   'classifications',jsonb_build_object('data','security')));
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('requestId',rid,'operation',op);
END $$;

-- The server identity role reaches this path after verifying mailbox control.
CREATE FUNCTION identity.lp11_close_mailbox_scope() RETURNS void
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 DELETE FROM control_plane.lp11_sso_scope s WHERE s.transaction_id=pg_current_xact_id_if_assigned()
  AND s.login=session_user AND s.operation='mailbox_emergency'
$$;
ALTER FUNCTION identity.lp11_close_mailbox_scope() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.lp11_close_mailbox_scope() FROM PUBLIC;

CREATE OR REPLACE FUNCTION identity.sso_emergency_use(u uuid,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; member record; actor uuid; owner_role text; event record; approval identity.sso_emergency_approval;
 rule uuid; command uuid; minutes integer; now_ts timestamptz;
 cause text:='EMERGENCY_REFUSED'; result jsonb; outcome jsonb; prior_tenant text:=current_setting('app.tenant_id',true); BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT pg_has_role(session_user,'jobguard_identity','USAGE') THEN RETURN jsonb_build_object('used',false,'cause','SSO_ROUTE_BLOCKED'); END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_INPUT_INVALID'); END IF;
 IF (p->>'version') IS DISTINCT FROM 'sso-emergency.v2'
  OR jsonb_typeof(p->'requested_tenant_id') IS DISTINCT FROM 'string'
  OR coalesce(p->>'requested_tenant_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  OR jsonb_typeof(p->'commandId') IS DISTINCT FROM 'string'
  OR coalesce(p->>'commandId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  OR jsonb_typeof(p->'reason') IS DISTINCT FROM 'string' OR length(coalesce(p->>'reason','')) NOT BETWEEN 20 AND 500
  OR (p-ARRAY['version','requested_tenant_id','commandId','windowMinutes','reason'])<>'{}'::jsonb
 THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_INPUT_INVALID'); END IF;
 t:=(p->>'requested_tenant_id')::uuid; command:=(p->>'commandId')::uuid;
 -- Authentication proved mailbox control before calling. Derive membership through the merged routine;
 -- an untrusted tenant UUID alone never grants authority to append a company's audit or emergency log.
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  IF member.tenant_id=t THEN actor:=member.id; END IF;
 END LOOP;
 IF actor IS NULL THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_MEMBER_NOT_ACTIVE'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Re-read the same membership under the company lock: an owner may have been
 -- downgraded, revoked or expired while this use waited. Never cache its role before waiting.
 SELECT m.role INTO owner_role FROM identity.current_memberships(u) m WHERE m.tenant_id=t AND m.id=actor;
 IF owner_role IS NULL OR (app.lp11_policy_tenant() IS NOT NULL AND
   (t IS DISTINCT FROM app.current_tenant() OR actor IS DISTINCT FROM app.current_actor()))
 THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_PERMISSION_REFUSED'); END IF;
 INSERT INTO control_plane.lp11_sso_scope(transaction_id,tenant_id,authority_id,operation,login,emergency_actor)
 VALUES(pg_current_xact_id(),t,u,'mailbox_emergency',session_user,actor);
 PERFORM set_config('app.tenant_id',t::text,true);
 <<checked_use>> BEGIN
 -- Recheck under the tenant lock, using the existing permission/active-member contract.
 IF (app.contractor_allowed(actor,'organisation.manage',t)) IS NOT TRUE THEN
  outcome:=jsonb_build_object('used',false,'cause','EMERGENCY_PERMISSION_REFUSED'); EXIT checked_use;
 END IF;
 SELECT * INTO event FROM identity.sso_required_state(t);
 IF event.required IS FALSE THEN
  -- A competing use sees the committed OFF revision under the same tenant lock.
  IF event.actor_kind='emergency' AND event.window_open IS TRUE AND EXISTS(SELECT 1 FROM identity.sso_emergency_use used JOIN identity.sso_emergency_approval a
    ON(a.tenant_id,a.id)=(used.tenant_id,used.approval_id)
    WHERE used.tenant_id=t AND used.event_id=event.event_id AND a.membership_id=actor) THEN
   INSERT INTO identity.sso_emergency_event(tenant_id,id,membership_id,outcome,cause_code,reason)
    VALUES(t,gen_random_uuid(),actor,'refused','EMERGENCY_ALREADY_USED',p->>'reason');
   outcome:=jsonb_build_object('used',false,'cause','EMERGENCY_ALREADY_USED','connectionId',event.connection_id,'actorMembershipId',actor);
   EXIT checked_use;
  END IF;
  outcome:=jsonb_build_object('used',false,'cause','EMERGENCY_SWITCH_OFF'); EXIT checked_use;
 END IF;
 IF owner_role IS DISTINCT FROM 'owner' THEN cause:='EMERGENCY_NOT_OWNER';
 ELSIF NOT EXISTS(SELECT 1 FROM identity.sso_emergency_approver_rule r WHERE r.version='company-owner-only.v1') THEN cause:='EMERGENCY_APPROVER_RULE_UNSET';
 ELSIF (CASE WHEN jsonb_typeof(p->'windowMinutes')='number'
  THEN (p->>'windowMinutes')::numeric BETWEEN 15 AND 240 AND (p->>'windowMinutes')::numeric=trunc((p->>'windowMinutes')::numeric)
  ELSE false END) IS NOT TRUE THEN cause:='EMERGENCY_WINDOW_INVALID';
 ELSIF EXISTS(SELECT 1 FROM identity.sso_emergency_window w WHERE w.tenant_id=t AND w.command_id=command) THEN cause:='EMERGENCY_COMMAND_REPLAYED';
 ELSE
  SELECT r.id INTO rule FROM identity.sso_emergency_approver_rule r WHERE r.version='company-owner-only.v1';
  minutes:=(p->>'windowMinutes')::numeric::integer; now_ts:=clock_timestamp();
  INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at)
   VALUES(t,gen_random_uuid(),actor,rule,'membership:'||actor::text,encode(sha256(convert_to(p->>'reason','UTF8')),'hex'),now_ts,now_ts+interval '1 minute') RETURNING * INTO approval;
  result:=identity.sso_required_append(t,event.connection_id,actor,'emergency',false,p->>'reason',event.revision);
  INSERT INTO identity.sso_emergency_use(tenant_id,approval_id,event_id) VALUES(t,approval.id,(result->>'eventId')::uuid);
  INSERT INTO identity.sso_emergency_window(tenant_id,approval_id,event_id,command_id,owner_membership_id,window_minutes,opened_at,closes_at)
   VALUES(t,approval.id,(result->>'eventId')::uuid,command,actor,minutes,now_ts,now_ts+make_interval(mins=>minutes));
  cause:='EMERGENCY_USED';
 END IF;
 INSERT INTO identity.sso_emergency_event(tenant_id,id,membership_id,outcome,cause_code,reason)
  VALUES(t,gen_random_uuid(),actor,(CASE WHEN result IS NULL THEN 'refused' ELSE 'used' END),cause,p->>'reason');
 outcome:=jsonb_build_object('used',result IS NOT NULL,'cause',cause,'connectionId',event.connection_id,'actorMembershipId',actor)
  ||(CASE WHEN result IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('eventId',result->>'eventId','windowMinutes',minutes,
   'closesAt',to_char((now_ts+make_interval(mins=>minutes)) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) END);
 END checked_use;
 PERFORM identity.lp11_close_mailbox_scope();
 PERFORM set_config('app.tenant_id',coalesce(prior_tenant,''),true);
 RETURN outcome;
END $$;

CREATE FUNCTION app.lp11_scim_binding_lookup(b uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT FROM control_plane.lp11_sso_scope s
  WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
   AND s.operation='scim2_lookup' AND s.authority_id=b)
$$;
ALTER FUNCTION app.lp11_scim_binding_lookup(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_scim_binding_lookup(uuid) FROM PUBLIC;

CREATE FUNCTION app.lp11_scim_connection_tenant(operations text[],c uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_sso_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND s.operation=ANY(operations) AND s.scim_connection=c
$$;
ALTER FUNCTION app.lp11_scim_connection_tenant(text[],uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_scim_connection_tenant(text[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_scim_connection_tenant(text[],uuid) TO jobguard_identity,jobguard_runtime,jobguard_session_lookup;

CREATE OR REPLACE FUNCTION identity.scim2_configure(s text, csrf text, t uuid, b uuid, c uuid, is_enabled boolean, credential_hash text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; prior_tenant text:=current_setting('app.tenant_id',true); BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 a:=identity.emergency_owner(s,csrf,t);
 UPDATE control_plane.lp11_sso_scope SET operation='scim2_configure',authority_id=b,scim_connection=c
  WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM set_config('app.tenant_id',t::text,true);
 IF credential_hash IS NULL OR credential_hash !~ '^[a-f0-9]{64}$' OR is_enabled IS NULL
 OR NOT EXISTS(SELECT 1 FROM identity.sso_connection WHERE tenant_id=t AND id=c)
 THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO identity.scim2_binding VALUES(t,b,c,is_enabled,credential_hash,clock_timestamp()+interval '1 day')
 ON CONFLICT(tenant_id,id) DO UPDATE SET enabled=EXCLUDED.enabled,token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at
 WHERE scim2_binding.connection_id=EXCLUDED.connection_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 UPDATE control_plane.lp11_sso_scope SET emergency_event='sso.scim.configured',emergency_subject=b
  WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM app.ef_audit(a,'sso.scim.configured','scim_binding',b,jsonb_build_object('references',jsonb_build_object('bindingId',b::text),
  'classifications',jsonb_build_object('data','security')));
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM set_config('app.tenant_id',coalesce(prior_tenant,''),true);
END $$;

CREATE OR REPLACE FUNCTION identity.scim2_machine(b uuid, token text, p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding identity.scim2_binding; t uuid; old identity.scim2_resource; rid uuid; event uuid;
 resource_kind text:=p->>'kind'; method text:=p->>'method'; doc jsonb:=p->'document'; result jsonb; previous identity.scim2_receipt;
 actor uuid; person uuid; member uuid; account uuid; address text; sh text; response jsonb; request_hash text;
 entry jsonb; rev integer;
 caller_tenant text:=current_setting('app.tenant_id',true); BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT pg_has_role(session_user,'jobguard_scim','USAGE')
  OR b IS NULL OR token IS NULL OR app.lp6e_request_binding_present()
 THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.lp11_sso_scope(transaction_id,authority_id,operation,login)
 VALUES(pg_current_xact_id(),b,'scim2_lookup',session_user);
 SELECT * INTO binding FROM identity.scim2_binding WHERE id=b;
 IF binding.id IS NULL OR token IS NULL OR binding.token_hash IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
 OR NOT binding.enabled OR binding.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 t:=binding.tenant_id;
 UPDATE control_plane.lp11_sso_scope SET tenant_id=t,operation='scim2_machine',scim_connection=binding.connection_id
  WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Recheck after serializing with rotation/disabling; do not cache authorization before the lock.
 SELECT * INTO binding FROM identity.scim2_binding WHERE tenant_id=t AND id=b FOR SHARE;
 IF NOT FOUND OR NOT binding.enabled OR binding.expires_at<=clock_timestamp() OR binding.token_hash IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
 THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'scim2-machine.v1'
 OR (p-ARRAY['version','method','kind','id','eventId','expectedRevision','document'])<>'{}'::jsonb
 OR resource_kind NOT IN('Users','Groups') OR method NOT IN('GET','POST','PUT','PATCH','DELETE') OR resource_kind IS NULL OR method IS NULL
 THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
 rid:=(p->>'id')::uuid;
 IF method='GET' THEN
  IF rid IS NULL THEN
   SELECT jsonb_build_object('schemas',jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:ListResponse'),
    'totalResults',count(*),'startIndex',1,'itemsPerPage',count(*),'Resources',coalesce(jsonb_agg(document ORDER BY id),'[]'::jsonb))
    INTO response FROM identity.scim2_resource WHERE tenant_id=t AND binding_id=b AND scim2_resource.kind=resource_kind AND NOT deleted;
  ELSE
   SELECT document INTO response FROM identity.scim2_resource WHERE tenant_id=t AND binding_id=b AND id=rid AND scim2_resource.kind=resource_kind AND NOT deleted;
   IF response IS NULL THEN RAISE EXCEPTION 'SCIM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  UPDATE control_plane.lp11_sso_scope SET emergency_event='sso.scim.get',emergency_subject=b
   WHERE transaction_id=pg_current_xact_id_if_assigned();
  PERFORM identity.scim2_audit(b,'sso.scim.get','scim_binding',b,
   jsonb_build_object('classifications',jsonb_build_object('data','security')));
  PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN response;
 END IF;
 event:=(p->>'eventId')::uuid;
 IF event IS NULL OR rid IS NULL THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
 request_hash:=app.final_lock_hash(p);
 SELECT * INTO previous FROM identity.scim2_receipt WHERE tenant_id=t AND binding_id=b AND id=event;
 IF FOUND THEN
  IF previous.request_hash<>request_hash THEN RAISE EXCEPTION 'SCIM_CONFLICT' USING ERRCODE='23505'; END IF;
  PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN previous.response;
 END IF;
 SELECT * INTO old FROM identity.scim2_resource WHERE tenant_id=t AND binding_id=b AND id=rid;
 IF method='POST' THEN
  IF old.id IS NOT NULL THEN RAISE EXCEPTION 'SCIM_CONFLICT' USING ERRCODE='23505'; END IF;
  rev:=1;
 ELSE
  IF old.id IS NULL OR old.kind<>resource_kind OR old.deleted THEN RAISE EXCEPTION 'SCIM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF (p->>'expectedRevision')::integer IS DISTINCT FROM old.revision THEN RAISE EXCEPTION 'SCIM_STALE' USING ERRCODE='40001'; END IF;
  rev:=old.revision+1;
 END IF;
 IF method='PATCH' THEN
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR (doc-ARRAY['schemas','Operations'])<>'{}'::jsonb
   OR doc->'schemas' IS DISTINCT FROM '["urn:ietf:params:scim:api:messages:2.0:PatchOp"]'::jsonb
   OR jsonb_typeof(doc->'Operations') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'Operations') NOT BETWEEN 1 AND 20
   THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
  result:=old.document-ARRAY['id','meta'];
  FOR entry IN SELECT value FROM jsonb_array_elements(doc->'Operations') LOOP
   IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (entry-ARRAY['op','path','value'])<>'{}'::jsonb
    OR coalesce(entry->>'op','') NOT IN('add','replace','remove') OR coalesce(entry->>'path','') NOT IN('active','displayName','members')
    THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
   IF entry->>'op'='remove' THEN
    IF entry->>'path'<>'members' THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
    result:=jsonb_set(result,'{members}','[]'::jsonb);
   ELSIF entry->>'path'='members' AND entry->>'op'='add' THEN
    IF jsonb_typeof(entry->'value') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
    result:=jsonb_set(result,'{members}',coalesce(result->'members','[]'::jsonb)||(entry->'value'));
   ELSE
    IF NOT entry ? 'value' THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
    result:=jsonb_set(result,ARRAY[entry->>'path'],entry->'value');
   END IF;
  END LOOP;
  doc:=result;
 END IF;
 IF resource_kind='Users' THEN
  IF method='DELETE' THEN doc:=(old.document-ARRAY['id','meta'])||'{"active":false}'::jsonb; END IF;
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR (doc-ARRAY['schemas','externalId','userName','active','displayName'])<>'{}'::jsonb
   OR doc->'schemas' IS DISTINCT FROM '["urn:ietf:params:scim:schemas:core:2.0:User"]'::jsonb
   OR jsonb_typeof(doc->'active') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(doc->'externalId') IS DISTINCT FROM 'string' OR length(doc->>'externalId') NOT BETWEEN 1 AND 200
   OR jsonb_typeof(doc->'userName') IS DISTINCT FROM 'string'
   OR length(doc->>'userName')>320 OR doc->>'userName'<>lower(doc->>'userName')
   OR doc->>'userName' !~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$'
   OR (doc ? 'displayName' AND (jsonb_typeof(doc->'displayName')<>'string' OR length(doc->>'displayName')>200))
   THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
  address:=doc->>'userName'; sh:=encode(sha256(convert_to(doc->>'externalId','UTF8')),'hex');
  IF NOT EXISTS(SELECT 1 FROM identity.verified_domain WHERE tenant_id=t AND connection_id=binding.connection_id AND domain=split_part(address,'@',2))
   THEN RAISE EXCEPTION 'SCIM_DOMAIN_UNVERIFIED' USING ERRCODE='42501'; END IF;
  IF method='POST' THEN
   -- No email-code account linking, even for this tenant. Linking requires the existing explicit human flow.
   IF EXISTS(SELECT 1 FROM identity.user_email WHERE email=address) OR EXISTS(SELECT 1 FROM identity.sso_subject
      WHERE tenant_id=t AND connection_id=binding.connection_id AND subject_hash=sh)
    THEN RAISE EXCEPTION 'SCIM_LINK_REQUIRED' USING ERRCODE='42501'; END IF;
   person:=gen_random_uuid(); member:=gen_random_uuid();
   SELECT id INTO account FROM app.account WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
   INSERT INTO identity.identity_user(id) VALUES(person);
   INSERT INTO identity.user_email VALUES(address,person);
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,person,'read_only');
   INSERT INTO identity.membership_locator VALUES(person,t,member);
   INSERT INTO app.contractor_member VALUES(t,member,NULL,address);
   INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id)
    VALUES(t,binding.connection_id,sh,encode(sha256(convert_to(address,'UTF8')),'hex'),person,member);
  ELSE
   member:=old.membership_id;
   IF old.document->>'externalId' IS DISTINCT FROM doc->>'externalId' OR old.document->>'userName' IS DISTINCT FROM address
    THEN RAISE EXCEPTION 'SCIM_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
   IF EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=member AND role='owner')
    OR EXISTS(SELECT 1 FROM identity.emergency_approval WHERE tenant_id=t AND approver=member)
    THEN RAISE EXCEPTION 'SCIM_OWNER_PROTECTED' USING ERRCODE='42501'; END IF;
   IF doc->>'active'='true' AND EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=member AND revoked_at IS NOT NULL)
    THEN RAISE EXCEPTION 'SCIM_REACTIVATION_REFUSED' USING ERRCODE='42501'; END IF;
  END IF;
  IF doc->>'active'='false' THEN
   -- Existing controlled routine revokes membership, grants and bound sessions in this same transaction.
   result:=identity.scim_deactivate(binding.connection_id,jsonb_build_object('version','scim-deactivation.v1',
    'eventId',event,'subjectHash',sh,'eventHash',request_hash));
   IF result->>'outcome'='refused' THEN RAISE EXCEPTION 'SCIM_OWNER_PROTECTED' USING ERRCODE='42501'; END IF;
   INSERT INTO control_plane.lp11_sso_scope(transaction_id,tenant_id,authority_id,operation,login,scim_connection)
   VALUES(pg_current_xact_id(),t,b,'scim2_machine',session_user,binding.connection_id);
  END IF;
 ELSE
  IF method='DELETE' THEN doc:=old.document-ARRAY['id','meta']; END IF;
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR (doc-ARRAY['schemas','displayName','members','externalId'])<>'{}'::jsonb
   OR doc->'schemas' IS DISTINCT FROM '["urn:ietf:params:scim:schemas:core:2.0:Group"]'::jsonb
   OR jsonb_typeof(doc->'displayName') IS DISTINCT FROM 'string' OR length(doc->>'displayName') NOT BETWEEN 1 AND 200
   OR jsonb_typeof(doc->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'members')>200
   THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(doc->'members') LOOP
   IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (entry-ARRAY['value'])<>'{}'::jsonb OR NOT entry ? 'value'
    OR NOT EXISTS(SELECT 1 FROM identity.scim2_resource WHERE tenant_id=t AND binding_id=b AND kind='Users'
      AND id=(entry->>'value')::uuid AND NOT deleted AND document->>'active'='true')
    THEN RAISE EXCEPTION 'SCIM_MEMBER_REFUSED' USING ERRCODE='42501'; END IF;
  END LOOP;
  -- Directory groups never create authority. Existing audited SSO group mapping remains the only role-mapping path.
 END IF;
 response:=doc||jsonb_build_object('id',rid::text,'meta',jsonb_build_object('resourceType',CASE WHEN resource_kind='Users' THEN 'User' ELSE 'Group' END,'version','W/"'||rev::text||'"'));
 INSERT INTO identity.scim2_resource VALUES(t,b,rid,resource_kind,rev,response,member,method='DELETE')
 ON CONFLICT(tenant_id,binding_id,id) DO UPDATE SET revision=EXCLUDED.revision,document=EXCLUDED.document,deleted=EXCLUDED.deleted;
 INSERT INTO identity.scim2_receipt VALUES(t,b,event,request_hash,response);
 -- Machine audit actor is a dedicated reference, never an alleged human owner.
 UPDATE control_plane.lp11_sso_scope SET emergency_event='sso.scim.'||lower(method),emergency_subject=b
  WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM identity.scim2_audit(b,'sso.scim.'||lower(method),'scim_binding',b,
  jsonb_build_object('references',jsonb_build_object('bindingId',b::text,'machine','scim2'),
  'hashes',jsonb_build_object('request',request_hash),'classifications',jsonb_build_object('data','security')));
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN response;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
  RAISE;
END $$;

-- A revocation must be auditable even when the exact credential can no
-- longer make a normal request. The revoker records one specific audit fact.
CREATE UNLOGGED TABLE control_plane.lp11_practice_revoke_audit (
 transaction_id xid8 NOT NULL,
 tenant_id uuid NOT NULL,
 session_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 PRIMARY KEY(transaction_id,session_id)
);
ALTER TABLE control_plane.lp11_practice_revoke_audit OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_practice_revoke_audit FROM PUBLIC;

CREATE FUNCTION app.lp11_practice_revoke_event(t uuid, event text, subject_type text, subject text, actor text) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT event='contractor.practice_session.revoked' AND subject_type='practice-session' AND EXISTS(
  SELECT FROM control_plane.lp11_practice_revoke_audit r
  WHERE r.transaction_id=pg_current_xact_id_if_assigned() AND r.tenant_id=t
   AND r.session_id::text=subject AND 'membership:'||r.membership_id=actor)
$$;
ALTER FUNCTION app.lp11_practice_revoke_event(uuid,text,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_practice_revoke_event(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_practice_revoke_event(uuid,text,text,text,text) TO jobguard_audit_writer;

CREATE OR REPLACE FUNCTION identity.sso_require_admin(s char(64),t uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; m uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO u FROM identity.session WHERE token_digest=s AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF u IS NULL THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.bind_request('real',s::text,t);
 SELECT id INTO m FROM app.membership WHERE tenant_id=t AND identity_user_id=u AND app.contractor_allowed(id,'organisation.manage',t) FOR SHARE;
 IF m IS NULL THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_cache(c uuid,k text,v text,state char(64),link_session uuid,operation text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; result text; BEGIN
 t:=identity.lp11_open_sso_scope(c,'cache');
 IF operation='save' THEN
  INSERT INTO identity.sso_request(tenant_id,connection_id,request_id,request_value,state_digest,link_session_id,expires_at) VALUES(t,c,k,v,state,link_session,clock_timestamp()+interval '10 minutes'); DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned(); RETURN v;
 ELSIF operation='get' THEN
  SELECT request_value INTO result FROM identity.sso_request WHERE tenant_id=t AND connection_id=c AND request_id=k AND expires_at>clock_timestamp() AND consumed_at IS NULL; DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned(); RETURN result;
 ELSIF operation='remove' THEN
  UPDATE identity.sso_request SET consumed_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND request_id=k AND consumed_at IS NULL RETURNING request_value INTO result; DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned(); RETURN result;
 ELSE RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_complete(c uuid,claims jsonb,state char(64),new_session uuid,token char(64),csrf text,expires timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; r identity.sso_request; sub identity.sso_subject; u uuid; member uuid; account uuid; address text:=(claims->>'email'); email_domain text; group_row record; grant_id uuid; grants_count integer:=0; allow_new_grants boolean:=false; sh char(64):=(claims->>'subjectHash'); eh char(64):=(claims->>'emailHash'); link identity.session; binding jsonb; BEGIN
 t:=identity.lp11_open_sso_scope(c,'complete');
 binding:=identity.sso_load_connection(c);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Match email-code serialization order and lock globally shared email before identity creation/linking.
 PERFORM pg_advisory_xact_lock(hashtextextended('identity-email:'||address,0));
 SELECT * INTO r FROM identity.sso_request WHERE tenant_id=t AND connection_id=c AND request_id=(claims->>'requestId') FOR UPDATE;
 IF r.request_id IS NULL OR r.state_digest<>state OR r.expires_at<=clock_timestamp() OR r.consumed_at IS NULL THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 IF address IS NULL OR address<>lower(address) OR address NOT LIKE '%.invalid' OR length(address)>320 THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 email_domain:=split_part(address,'@',2);
 IF NOT EXISTS(SELECT 1 FROM identity.verified_domain WHERE tenant_id=t AND connection_id=c AND verified_domain.domain=email_domain) THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 IF binding->>'protocol'='oidc' THEN
  IF EXISTS(SELECT 1 FROM identity.oidc_assertion_use WHERE tenant_id=t AND connection_id=c AND (assertion_id=claims->>'assertionId' OR request_id=r.request_id)) THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM identity.sso_assertion_use WHERE assertion_id=(claims->>'assertionId')) THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
 END IF;
 SELECT * INTO sub FROM identity.sso_subject WHERE tenant_id=t AND connection_id=c AND subject_hash=sh;
 IF sub.user_id IS NOT NULL THEN
  IF sub.email_hash<>eh THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  u:=sub.user_id; member:=sub.membership_id;
  IF NOT app.contractor_member_active(member) THEN RAISE EXCEPTION 'MEMBERSHIP_REVOKED' USING ERRCODE='42501'; END IF;
  -- Existing linked SSO identity cannot be replaced by a different account.
  IF r.link_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity.session WHERE id=r.link_session_id AND user_id=u AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT user_id INTO u FROM identity.user_email WHERE email=address;
  IF u IS NOT NULL THEN
   IF r.link_session_id IS NULL THEN RAISE EXCEPTION 'LINK_REQUIRED' USING ERRCODE='42501'; END IF;
   SELECT * INTO link FROM identity.session WHERE id=r.link_session_id AND user_id=u AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
   IF link.id IS NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
   SELECT id INTO member FROM app.membership WHERE tenant_id=t AND identity_user_id=u AND app.contractor_member_active(id) FOR SHARE;
   IF member IS NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSIF r.link_session_id IS NOT NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501';
  END IF;
 END IF;
 IF member IS NOT NULL THEN allow_new_grants:=(app.mon8_sso_feature_decision(member)->>'executable')::boolean; END IF;
 SELECT count(*) INTO grants_count FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'));
 IF sub.user_id IS NOT NULL THEN
  -- Revocation on a verified next sign-in is a committed fact even if no mapped group remains.
  UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id IN(SELECT session_id FROM identity.sso_session_binding WHERE tenant_id=t AND connection_id=c AND subject_hash=sh) AND revoked_at IS NULL;
  INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT t,gen_random_uuid(),g.grant_id FROM identity.sso_grant g
   WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id)
   AND (allow_new_grants OR NOT EXISTS(
    SELECT 1 FROM app.role_grant old_grant JOIN (
     SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC
    ) mapping ON mapping.role=old_grant.role AND mapping.scope_kind=old_grant.scope_kind AND mapping.scope_id=old_grant.scope_id
    WHERE old_grant.tenant_id=t AND old_grant.id=g.grant_id AND mapping.enabled
    AND mapping.idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'))));
 END IF;
 IF grants_count=0 THEN
  IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN jsonb_build_object('code','NO_MAPPED_GRANTS');
 END IF;
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '15 minutes' THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 -- DB uniqueness is inside the same transaction as identity, membership, grants and session.
 IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
 IF member IS NULL THEN
  u:=gen_random_uuid(); member:=gen_random_uuid();
  SELECT id INTO account FROM app.account WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(address,u);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,u,'read_only');
  INSERT INTO app.contractor_member VALUES(t,member,NULL,address);
  INSERT INTO identity.membership_locator VALUES(u,t,member);
 END IF;
 IF sub.user_id IS NULL THEN IF NOT (app.mon8_sso_feature_decision(member)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; allow_new_grants:=true; END IF;
 IF sub.user_id IS NULL THEN
  INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES(t,c,sh,eh,u,member);
 END IF;
 FOR group_row IN SELECT * FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND allow_new_grants AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups')) LOOP
  grant_id:=gen_random_uuid();
  IF group_row.role='operative' THEN
   IF NOT (app.lp6d_sso_operative_roles_decision(member)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   INSERT INTO identity.lp6d_sso_grant_permit(tenant_id,grant_id,membership_id,backend_pid,transaction_id)
    VALUES(t,grant_id,member,pg_backend_pid(),pg_current_xact_id());
  END IF;
  INSERT INTO app.role_grant VALUES(t,grant_id,member,group_row.role,group_row.scope_kind,group_row.scope_id,NULL);
  INSERT INTO identity.sso_grant(tenant_id,connection_id,subject_hash,grant_id) VALUES(t,c,sh,grant_id);
 END LOOP;
 INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES(new_session,u,'synthetic_demo',token,csrf,expires);
 INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id) VALUES(t,c,sh,new_session);
 INSERT INTO identity.security_event(id,event_type,subject_id) VALUES(gen_random_uuid(),'session.issued',new_session);
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN jsonb_build_object('userId',u,'membershipId',member,'tenantId',t);
END $$;

CREATE OR REPLACE FUNCTION identity.scim_deactivate(c uuid,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 t uuid; previous identity.scim_event; source_id uuid; person_id uuid;
 target_ids uuid[]:=ARRAY[]::uuid[]; member record; protected_owner boolean:=false;
 changed_at timestamptz; record_id uuid:=gen_random_uuid();
 result_outcome text:='ignored'; result_cause text;
 membership_count integer:=0; session_count integer:=0; grant_count integer:=0;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SCIM_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_SCIM_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'version') IS DISTINCT FROM 'scim-deactivation.v1'
  OR jsonb_typeof(p->'version') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p->'eventId') IS DISTINCT FROM 'string'
  OR ((p->>'eventId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') IS NOT TRUE
  OR jsonb_typeof(p->'subjectHash') IS DISTINCT FROM 'string'
  OR ((p->>'subjectHash') ~ '^[0-9a-f]{64}$') IS NOT TRUE
  OR jsonb_typeof(p->'eventHash') IS DISTINCT FROM 'string'
  OR ((p->>'eventHash') ~ '^[0-9a-f]{64}$') IS NOT TRUE
  OR (p-ARRAY['version','eventId','subjectHash','eventHash'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'INVALID_SCIM_INPUT' USING ERRCODE='22023'; END IF;
 source_id:=(p->>'eventId')::uuid;
 t:=identity.lp11_open_sso_scope(c,'scim');
 IF t IS NULL THEN RAISE EXCEPTION 'SCIM_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO previous FROM identity.scim_event e WHERE e.tenant_id=t AND e.connection_id=c AND e.source_event_id=source_id;
 IF FOUND THEN
  IF previous.subject_hash IS DISTINCT FROM (p->>'subjectHash') OR previous.event_hash IS DISTINCT FROM (p->>'eventHash') THEN
   RAISE EXCEPTION 'SCIM_EVENT_CONFLICT' USING ERRCODE='23505';
  END IF;
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN jsonb_build_object('outcome',previous.outcome,'cause',previous.cause_code,'recordId',previous.id,'replayed',true);
 END IF;
 changed_at:=clock_timestamp();
 SELECT sub.user_id INTO person_id FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.connection_id=c AND sub.subject_hash=(p->>'subjectHash');
 IF person_id IS NULL THEN result_cause:='SCIM_SUBJECT_NOT_LINKED';
 ELSE
  FOR member IN SELECT m.id,m.role FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=person_id AND m.revoked_at IS NULL ORDER BY m.id FOR UPDATE LOOP
   target_ids:=array_append(target_ids,member.id);
   IF member.role='owner' THEN protected_owner:=true; END IF;
  END LOOP;
  IF cardinality(target_ids)=0 THEN result_cause:='SCIM_ALREADY_INACTIVE';
  ELSIF protected_owner THEN result_outcome:='refused';result_cause:='SCIM_OWNER_PROTECTED';
  ELSE
   UPDATE app.membership SET revoked_at=changed_at WHERE tenant_id=t AND id=ANY(target_ids) AND revoked_at IS NULL;
   GET DIAGNOSTICS membership_count=ROW_COUNT;
   UPDATE identity.session SET revoked_at=changed_at WHERE revoked_at IS NULL AND user_id=person_id AND id IN(
    SELECT b.session_id FROM identity.sso_session_binding b JOIN identity.sso_subject sub
     ON(sub.tenant_id,sub.connection_id,sub.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash)
    WHERE b.tenant_id=t AND sub.tenant_id=t AND sub.user_id=person_id);
   GET DIAGNOSTICS session_count=ROW_COUNT;
   INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id)
    SELECT t,gen_random_uuid(),g.id FROM app.role_grant g WHERE g.tenant_id=t AND g.membership_id=ANY(target_ids)
     AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=t AND r.grant_id=g.id);
   GET DIAGNOSTICS grant_count=ROW_COUNT;
   result_outcome:='deactivated';result_cause:='SCIM_DEACTIVATED';
  END IF;
 END IF;
 INSERT INTO identity.scim_event(tenant_id,id,connection_id,source_event_id,subject_hash,event_hash,outcome,cause_code,user_id,memberships_revoked,sessions_revoked,grants_revoked,created_at)
 VALUES(t,record_id,c,source_id,p->>'subjectHash',p->>'eventHash',result_outcome,result_cause,person_id,membership_count,session_count,grant_count,changed_at);
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN jsonb_build_object('outcome',result_outcome,'cause',result_cause,'recordId',record_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION identity.sso_audit_append(c uuid,e jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM identity.lp11_open_sso_scope(c,'audit');
 IF e->>'subjectRef' IS DISTINCT FROM c::text OR e->>'subjectType' IS DISTINCT FROM 'sso-connection'
  OR e->>'eventType' IS NULL OR (e->>'eventType') NOT LIKE 'sso.%' THEN
  RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 PERFORM app.lp4_seal_audit(jsonb_build_array(e),'lower_trust');
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;

CREATE OR REPLACE FUNCTION app.revoke_contractor_practice_session(s uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp6d_bound boolean;
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 -- Ben's LP-6b ruling (5 Nov) keeps ContractorPracticeSessionRepository.revoke as the named
 -- "contractor-session-revoke" skip: the holder must still be able to end their own session
 -- after membership revocation, which no binding can express (a revoked base never binds).
 -- So a BOUND caller must be this very session's actor; the unbound skip path keeps the body's
 -- own live-credential and tenant authentication below, exactly as before LP-6d.
 BEGIN PERFORM app.current_actor(); lp6d_bound:=true;
 EXCEPTION WHEN insufficient_privilege THEN lp6d_bound:=false; END;
 IF NOT lp6d_bound THEN NULL;
 ELSIF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.lp6d_contractor_session_identity(s) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE requested uuid; target control_plane.contractor_practice_session; reading timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  requested:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN requested:=NULL;
 END;
 SELECT x.* INTO target FROM control_plane.contractor_practice_session x WHERE x.session_digest=app.contractor_practice_session_digest(s) FOR UPDATE;
 reading:=clock_timestamp();
 -- The only repetition of the row's live tests: store the exact reading tested.
 IF s IS NULL OR target.session_id IS NULL OR requested IS NULL OR requested IS DISTINCT FROM target.tenant_id
  OR target.revoked_at IS NOT NULL OR target.expires_at<=reading OR app.contractor_practice_home_deadline(target.session_digest,reading)<=reading
 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 UPDATE control_plane.contractor_practice_session x SET revoked_at=reading WHERE x.session_id=target.session_id;
 INSERT INTO control_plane.lp11_practice_revoke_audit VALUES(pg_current_xact_id(),target.tenant_id,target.session_id,target.membership_id);
 RETURN jsonb_build_object('session',target.session_id,'member',target.membership_id,'revokedAt',to_char(reading AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END;
END
$$;

CREATE OR REPLACE FUNCTION app.contractor_practice_session_require_audit() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.event_type='contractor.practice_session.revoked'
   AND e.subject_type='practice-session' AND e.subject_ref=NEW.session_id::text AND e.actor_ref='membership:'||NEW.membership_id
 ) THEN RAISE EXCEPTION 'PRACTICE_SESSION_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
  DELETE FROM control_plane.lp11_practice_revoke_audit WHERE transaction_id=pg_current_xact_id_if_assigned() AND session_id=NEW.session_id;
 END IF;
 RETURN NULL;
END $$;

-- Maintenance trigger reads are scoped to the triggering tenant and job.
-- Recorded party revisions become visible only after the current binding is read.
CREATE UNLOGGED TABLE control_plane.lp11_maintenance_job (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid,
 source_evidence_id uuid,
 customer_revision_ids uuid[],
 site_revision_id uuid,
 track_write boolean NOT NULL DEFAULT false,
 CHECK(job_id IS NOT NULL OR source_evidence_id IS NOT NULL)
);
ALTER TABLE control_plane.lp11_maintenance_job OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_maintenance_job FROM PUBLIC;

CREATE FUNCTION app.lp11_open_maintenance_job(t uuid,j uuid) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF t IS NULL OR j IS NULL OR NOT app.lp6d_maintenance_login() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF app.lp6e_request_binding_present() THEN
  IF t IS DISTINCT FROM coalesce(app.current_tenant(),app.lp11_delegated_job_tenant(j)) THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
 ELSE
  INSERT INTO control_plane.lp11_maintenance_job(transaction_id,tenant_id,job_id)
   VALUES(pg_current_xact_id(),t,j);
 END IF;
END $$;
ALTER FUNCTION app.lp11_open_maintenance_job(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_open_maintenance_job(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION app.lp11_maintenance_job_tenant(j uuid,customer_revision uuid,site_revision uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_maintenance_job s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned()
  AND (s.job_id=j OR customer_revision=ANY(s.customer_revision_ids) OR s.site_revision_id=site_revision)
$$;
ALTER FUNCTION app.lp11_maintenance_job_tenant(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_maintenance_job_tenant(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_maintenance_job_tenant(uuid,uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.lp11_maintenance_evidence_tenant(evidence uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_maintenance_job s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.source_evidence_id=evidence
$$;
ALTER FUNCTION app.lp11_maintenance_evidence_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_maintenance_evidence_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_maintenance_evidence_tenant(uuid) TO jobguard_runtime;

CREATE FUNCTION app.lp11_maintenance_track_tenant(j uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_maintenance_job s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.job_id=j AND s.track_write
$$;
ALTER FUNCTION app.lp11_maintenance_track_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_maintenance_track_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_maintenance_track_tenant(uuid) TO jobguard_runtime;

-- Direct maintenance advances only the next revision of the same draft.
CREATE UNLOGGED TABLE control_plane.lp11_maintenance_draft_revision (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 draft_id uuid NOT NULL,
 revision_id uuid NOT NULL
);
ALTER TABLE control_plane.lp11_maintenance_draft_revision OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_maintenance_draft_revision FROM PUBLIC;

CREATE FUNCTION app.lp11_maintenance_draft_revision_tenant(draft uuid,revision uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_maintenance_draft_revision s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned()
  AND (s.draft_id,s.revision_id)=(draft,revision)
$$;
ALTER FUNCTION app.lp11_maintenance_draft_revision_tenant(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_maintenance_draft_revision_tenant(uuid,uuid) FROM PUBLIC;
CREATE POLICY lp11_maintenance_draft_revision ON app.final_account_revision FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_maintenance_draft_revision_tenant(final_account_draft_id,id));

CREATE OR REPLACE FUNCTION app.guard_final_account_draft_advance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE maintenance boolean;
BEGIN
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id
    OR NEW.revision IS DISTINCT FROM OLD.revision THEN
  maintenance:=app.lp6d_maintenance_login() AND NOT app.lp6e_request_binding_present();
  IF maintenance AND NEW.current_revision_id IS NOT NULL THEN
   INSERT INTO control_plane.lp11_maintenance_draft_revision(transaction_id,tenant_id,draft_id,revision_id)
   VALUES(pg_current_xact_id(),NEW.tenant_id,NEW.id,NEW.current_revision_id);
  END IF;
  IF NEW.revision IS DISTINCT FROM OLD.revision + 1
     OR NOT EXISTS (
      SELECT 1 FROM app.final_account_revision r
      WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.current_revision_id
       AND r.final_account_draft_id=NEW.id AND r.revision=NEW.revision
       AND r.previous_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
     ) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
  IF maintenance THEN
   DELETE FROM control_plane.lp11_maintenance_draft_revision
   WHERE transaction_id=pg_current_xact_id_if_assigned();
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Administrative variation inserts can stamp one legacy origin for the
-- exact variation witnessed by the AFTER INSERT trigger.
CREATE UNLOGGED TABLE control_plane.lp11_legacy_origin_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 variation_id uuid NOT NULL
);
ALTER TABLE control_plane.lp11_legacy_origin_scope OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_legacy_origin_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_legacy_origin_tenant(j uuid,v uuid,command_key text) RETURNS uuid
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_legacy_origin_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned()
  AND ((s.job_id,s.variation_id)=(j,v) OR command_key='extra-origin:'||s.job_id::text||':'||s.variation_id::text)
$$;
ALTER FUNCTION app.lp11_legacy_origin_tenant(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_legacy_origin_tenant(uuid,uuid,text) FROM PUBLIC;
CREATE POLICY lp11_legacy_origin_insert ON app.extra_origin FOR INSERT TO jobguard_migration
 WITH CHECK (provenance='legacy_synthetic_capture' AND tenant_id=app.lp11_legacy_origin_tenant(job_id,variation_id,NULL));
CREATE POLICY lp11_legacy_origin_command ON app.command_receipt FOR SELECT TO jobguard_migration
 USING (command_type='LogBuilderExtra' AND tenant_id=app.lp11_legacy_origin_tenant(NULL,NULL,semantic_key));

CREATE OR REPLACE FUNCTION app.record_legacy_builder_origin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE maintenance boolean:=app.lp6d_maintenance_login() AND NOT app.lp6e_request_binding_present();
BEGIN
 IF NEW.job_track<>'small_builder' OR NEW.origin<>'builder_logged' THEN RETURN NEW; END IF;
 IF maintenance THEN
  INSERT INTO control_plane.lp11_legacy_origin_scope(transaction_id,tenant_id,job_id,variation_id)
  VALUES(pg_current_xact_id(),NEW.tenant_id,NEW.job_id,NEW.id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_type='LogBuilderExtra' AND semantic_key=('extra-origin:'||NEW.job_id::text||':'||NEW.id::text)) THEN
  INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,raising_role,server_recorded_at,provenance,source_capture_kind,source_capture_hash)
  VALUES(NEW.tenant_id,NEW.job_id,NEW.id,NEW.job_track,NEW.origin,'legacy_unrecorded',transaction_timestamp(),'legacy_synthetic_capture',NEW.capture_kind,encode(sha256(convert_to(NEW.capture_text,'UTF8')),'hex'));
 END IF;
 IF maintenance THEN
  DELETE FROM control_plane.lp11_legacy_origin_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 END IF;
 RETURN NEW;
END $$;

-- The retired transition remains private. A maintenance invocation may change
-- only its exact job, and the nested triggers keep their own narrower scopes.
CREATE UNLOGGED TABLE control_plane.lp11_maintenance_job_transition (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL
);
ALTER TABLE control_plane.lp11_maintenance_job_transition OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_maintenance_job_transition FROM PUBLIC;

CREATE FUNCTION app.lp11_maintenance_job_transition_tenant(j uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_maintenance_job_transition s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.job_id=j
$$;
ALTER FUNCTION app.lp11_maintenance_job_transition_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_maintenance_job_transition_tenant(uuid) FROM PUBLIC;
CREATE POLICY lp11_maintenance_job_transition_read ON app.job FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_maintenance_job_transition_tenant(id));
CREATE POLICY lp11_maintenance_job_transition_update ON app.job FOR UPDATE TO jobguard_migration
 USING (tenant_id=app.lp11_maintenance_job_transition_tenant(id))
 WITH CHECK (tenant_id=app.lp11_maintenance_job_transition_tenant(id));

CREATE OR REPLACE FUNCTION app.transition_job(p_tenant uuid,p_job uuid,p_expected integer,p_to varchar,p_reason varchar,
 p_quote uuid DEFAULT NULL,p_net bigint DEFAULT NULL,p_policy varchar DEFAULT NULL,p_cap bigint DEFAULT NULL)
RETURNS app.job LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE current_job app.job;
 maintenance boolean:=app.lp6d_maintenance_login() AND NOT app.lp6e_request_binding_present();
BEGIN
 IF maintenance AND p_tenant IS NOT NULL AND p_job IS NOT NULL THEN
  INSERT INTO control_plane.lp11_maintenance_job_transition(transaction_id,tenant_id,job_id)
  VALUES(pg_current_xact_id(),p_tenant,p_job);
 END IF;
 SELECT * INTO current_job FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'job not found' USING ERRCODE='P0002'; END IF;
 IF current_job.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001'; END IF;
 IF NOT ((current_job.status='draft' AND p_to='quoting' AND p_reason='start_quote') OR
  (current_job.status='quoting' AND p_to='accepted' AND p_reason='accept_quote' AND p_quote IS NOT NULL) OR
  (current_job.status='quoting' AND p_to='lost' AND p_reason='quote_lost') OR
  (current_job.status='accepted' AND p_to='quoting' AND p_reason='cancel_acceptance') OR
  (current_job.status='accepted' AND p_to='live' AND p_reason='switch_live' AND p_quote IS NOT NULL AND p_net IS NOT NULL AND p_policy IS NOT NULL AND p_cap IS NOT NULL) OR
  (current_job.status='lost' AND p_to='quoting' AND p_reason='reopen_quote') OR
  (current_job.status='live' AND p_to='invoiced' AND p_reason='issue_invoice') OR
  (current_job.status='invoiced' AND p_to='paid' AND p_reason='balance_settled') OR
  (current_job.status='paid' AND p_to='invoiced' AND p_reason IN ('payment_reversal','additional_amount_due')))
 THEN RAISE EXCEPTION 'illegal job transition' USING ERRCODE='22023'; END IF;
 UPDATE app.job SET status=p_to,revision=revision+1,updated_at=transaction_timestamp(),
  accepted_quote_version_id=CASE WHEN p_to='accepted' THEN p_quote WHEN p_reason='cancel_acceptance' THEN NULL ELSE accepted_quote_version_id END,
  baseline_quote_version_id=CASE WHEN p_to='live' THEN p_quote ELSE baseline_quote_version_id END,
  accepted_net_value_pence=CASE WHEN p_to='live' THEN p_net ELSE accepted_net_value_pence END,
  fee_policy_version=CASE WHEN p_to='live' THEN p_policy ELSE fee_policy_version END,
  recovery_cap_pence=CASE WHEN p_to='live' THEN p_cap ELSE recovery_cap_pence END
 WHERE tenant_id=p_tenant AND id=p_job RETURNING * INTO current_job;
 IF maintenance THEN
  DELETE FROM control_plane.lp11_maintenance_job_transition
  WHERE transaction_id=pg_current_xact_id_if_assigned();
 END IF;
 RETURN current_job;
END $$;

CREATE OR REPLACE FUNCTION app.bind_small_builder_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j uuid; mode_value varchar; source_value varchar; maintenance boolean:=app.lp6d_maintenance_login();
BEGIN
 IF TG_TABLE_NAME='job' THEN
  IF NEW.status NOT IN ('live','invoiced','paid') OR NEW.provenance='imported' THEN RETURN NEW; END IF;
  j:=NEW.id; mode_value:='synthetic_demo'; source_value:='legacy_synthetic_live_fixture';
 ELSIF TG_TABLE_NAME='job_activation' THEN
  j:=NEW.job_id; mode_value:=NEW.mode; source_value:='quote_activation';
 ELSE
  j:=NEW.job_id; mode_value:='synthetic_demo'; source_value:='adoption_import';
 END IF;
 IF maintenance THEN
  PERFORM app.lp11_open_maintenance_job(NEW.tenant_id,j);
  UPDATE control_plane.lp11_maintenance_job SET track_write=true
   WHERE transaction_id=pg_current_xact_id_if_assigned();
 END IF;
 -- Only existing small-builder entry paths call this trigger. No user-selectable track.
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id)
 VALUES(NEW.tenant_id,j,'small_builder',mode_value,source_value,NEW.id) ON CONFLICT(tenant_id,job_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=j AND job_track='small_builder') THEN
  RAISE EXCEPTION 'immutable job track conflict' USING ERRCODE='23514';
 END IF;
 IF maintenance THEN DELETE FROM control_plane.lp11_maintenance_job
  WHERE transaction_id=pg_current_xact_id_if_assigned(); END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION app.lp11_watchdog_live_maintenance(t uuid,j uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE lifecycle text;
BEGIN
 PERFORM app.lp11_open_maintenance_job(t,j);
 SELECT status INTO lifecycle FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF lifecycle<>'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='P0001'; END IF;
 DELETE FROM control_plane.lp11_maintenance_job WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;
ALTER FUNCTION app.lp11_watchdog_live_maintenance(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_watchdog_live_maintenance(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_watchdog_live_maintenance(uuid,uuid) TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.lp6d_job_parties_maintenance(p_tenant uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE snapshot jsonb; BEGIN
 PERFORM app.lp11_open_maintenance_job(p_tenant,p_job);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 UPDATE control_plane.lp11_maintenance_job target
 SET customer_revision_ids=ARRAY[b.customer_revision_id,b.paying_party_revision_id],site_revision_id=b.site_revision_id
 FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(c.tenant_id,c.binding_id)
 WHERE target.transaction_id=pg_current_xact_id_if_assigned()
  AND (c.tenant_id,c.job_id)=(p_tenant,p_job);
 SELECT s.snapshot INTO snapshot FROM app.job_party_snapshot s JOIN app.job_party_current x ON(x.tenant_id,x.binding_id)=(s.tenant_id,s.binding_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 DELETE FROM control_plane.lp11_maintenance_job WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN snapshot;
END $$;

CREATE OR REPLACE FUNCTION app.require_job_parties() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE maintenance boolean:=app.lp6d_maintenance_login();
BEGIN
 IF TG_TABLE_NAME='job' THEN
   IF NEW.status='live' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF maintenance THEN PERFORM app.lp11_open_maintenance_job(NEW.tenant_id,NEW.id); END IF;
    IF NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id) THEN
     RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF maintenance THEN DELETE FROM control_plane.lp11_maintenance_job WHERE transaction_id=pg_current_xact_id_if_assigned(); END IF;
   END IF;
 ELSIF TG_TABLE_NAME IN('job_activation','imported_job_baseline') THEN
   IF maintenance THEN PERFORM app.lp11_open_maintenance_job(NEW.tenant_id,NEW.job_id); END IF;
   SELECT binding_id INTO NEW.party_binding_id FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
   IF maintenance THEN DELETE FROM control_plane.lp11_maintenance_job WHERE transaction_id=pg_current_xact_id_if_assigned(); END IF;
   IF NEW.party_binding_id IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 ELSE
   NEW.parties_snapshot:=CASE WHEN app.lp6d_maintenance_login() THEN app.lp6d_job_parties_maintenance(NEW.tenant_id,NEW.job_id) ELSE app.require_current_job_parties(NEW.tenant_id,NEW.job_id) END;
   IF TG_TABLE_NAME='quote_document_version' THEN
     IF NEW.snapshot ? 'jobParties' AND NEW.snapshot->'jobParties' IS DISTINCT FROM NEW.parties_snapshot THEN RAISE EXCEPTION 'PARTY_SNAPSHOT_MISMATCH' USING ERRCODE='22023'; END IF;
   END IF;
   IF NEW.parties_snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.guard_watchdog_input() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, app AS $$
BEGIN
  IF NOT app.lp6d_maintenance_login() AND NEW.tenant_id IS DISTINCT FROM coalesce(app.lp11_policy_tenant(),app.lp11_delegated_job_tenant(NEW.job_id))
  THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  -- These tables also hold non-watchdog bank evidence from the already
  -- controlled synthetic recovery routine. Only its migration-role execution
  -- may write its exact generated PDF class after live. Runtime cannot assume
  -- this role or gain the exception by forging a content type/key/mode.
  IF current_user='jobguard_migration' AND (to_jsonb(NEW)->>'scope_item_id') IS NULL
    AND (to_jsonb(NEW)->>'object_key') LIKE 'synthetic/recovery/%'
    AND ((TG_TABLE_NAME='evidence_upload' AND to_jsonb(NEW)->>'expected_content_type'='application/pdf' AND to_jsonb(NEW)->>'state'='verified')
      OR (TG_TABLE_NAME='evidence_object' AND to_jsonb(NEW)->>'evidence_type'='synthetic_bank_receipt' AND to_jsonb(NEW)->>'content_type'='application/pdf'))
  THEN RETURN NEW; END IF;
  -- Only migration-owned checked CH-4 administration can claim a pre-live ID.
  -- No GUC, caller-supplied mode or direct runtime write grants this exception.
  IF current_user='jobguard_migration' AND TG_TABLE_SCHEMA='app' AND TG_TABLE_NAME='watchdog_command_identity' THEN
    IF NEW.command_type IN('WorkState.close','WorkState.reopen','WorkState.link') AND EXISTS(
      SELECT 1 FROM app.command_receipt r JOIN app.job_commercial_track c ON c.tenant_id=r.tenant_id AND c.job_id=NEW.job_id
      WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.command_type=NEW.command_type
        AND r.semantic_key=NEW.command_id::text AND r.request_hash=NEW.request_hash AND r.status='processing'
        AND c.job_track='small_builder' AND c.environment='synthetic_demo'
        AND EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=r.tenant_id AND m.id=r.actor_membership_id
          AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
    ) THEN RETURN NEW; END IF;
  END IF;
  IF app.lp6d_maintenance_login() THEN PERFORM app.lp11_watchdog_live_maintenance(NEW.tenant_id,NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.guard_watchdog_upload_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
  IF (NEW.id,NEW.tenant_id,NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type,NEW.maximum_bytes)
    IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.job_id,OLD.scope_item_id,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type,OLD.maximum_bytes)
  THEN RAISE EXCEPTION 'evidence upload identity is immutable' USING ERRCODE='42501'; END IF;
  -- Check the original login, never current_user: a product caller inside a
  -- migration-owned SECURITY DEFINER routine still has no maintenance authority.
  -- USAGE preserves the existing inherited migration-login fixture convention.
  IF OLD.state='verified' AND NOT pg_has_role(session_user,'jobguard_migration','USAGE')
  THEN RAISE EXCEPTION 'verified evidence upload is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.state IN ('quarantined','verified') AND
    (NEW.state,NEW.object_version_id,NEW.server_verified_at) IS DISTINCT FROM (OLD.state,OLD.object_version_id,OLD.server_verified_at)
  THEN IF app.lp6d_maintenance_login() THEN PERFORM app.lp11_watchdog_live_maintenance(NEW.tenant_id,NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.ch4_guard_new_site_work() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE applies boolean:=true; job app.job;
 maintenance boolean:=app.lp6d_maintenance_login() AND NOT app.lp6e_request_binding_present();
BEGIN
 IF maintenance THEN PERFORM app.lp11_open_maintenance_job(NEW.tenant_id,NEW.job_id); END IF;
 IF TG_TABLE_NAME='supplier_document' THEN applies:=NEW.document_type='invoice'; END IF;
 IF TG_TABLE_NAME='supplier_document_intake' THEN applies:=EXISTS(SELECT 1 FROM app.supplier_document d WHERE (d.tenant_id,d.job_id,d.id)=(NEW.tenant_id,NEW.job_id,NEW.document_id) AND d.document_type='invoice'); END IF;
 IF TG_TABLE_NAME='variation' THEN applies:=NEW.origin='builder_logged' AND NEW.job_track='small_builder'; END IF;
 IF TG_TABLE_NAME='evidence_upload' THEN
  applies:=NEW.expected_content_type IN('image/png','image/jpeg','image/webp');
  -- The existing begin-upload replay still reaches INSERT ... ON CONFLICT. Match only the existing request contract.
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=(NEW.tenant_id,NEW.job_id,NEW.id)
   AND u.scope_item_id IS NOT DISTINCT FROM NEW.scope_item_id AND u.object_key=NEW.object_key AND u.expected_sha256=NEW.expected_sha256 AND u.expected_content_type=NEW.expected_content_type
   AND u.maximum_bytes=NEW.maximum_bytes AND u.retention_class=NEW.retention_class AND u.device_captured_at IS NOT DISTINCT FROM NEW.device_captured_at) THEN applies:=false; END IF;
  IF TG_OP='UPDATE' AND NEW.state NOT IN('quarantined','verified') THEN applies:=false; END IF;
  IF TG_OP='UPDATE' AND NEW.state=OLD.state AND NEW.object_version_id IS NOT DISTINCT FROM OLD.object_version_id THEN applies:=false; END IF;
 END IF;
 IF TG_TABLE_NAME='scope_progress' THEN applies:=NEW.stage IN('in_progress','complete') AND NEW.stage IS DISTINCT FROM OLD.stage; END IF;
 -- Proof evidence types: packages/core/src/proof.ts (proofEvidenceTypeSchema).
 IF TG_TABLE_NAME='evidence_object' THEN applies:=NEW.kind='original' AND NEW.evidence_type IN('pre_cover_photo','completion_photo','excavation_photo','electrical_certificate'); END IF;
 IF applies THEN
  IF maintenance THEN
   applies:=EXISTS(SELECT 1 FROM app.job_commercial_track
    WHERE (tenant_id,job_id)=(NEW.tenant_id,NEW.job_id)
     AND job_track='small_builder' AND environment='synthetic_demo');
   IF applies THEN
    SELECT * INTO job FROM app.job WHERE (tenant_id,id)=(NEW.tenant_id,NEW.job_id) FOR SHARE;
    IF NOT FOUND OR (job.practice_session_digest IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM app.authenticate_practice_session(job.practice_session_digest,NEW.tenant_id))) THEN
     RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501';
    END IF;
   END IF;
  ELSE
   applies:=app.ch4_source_job(NEW.tenant_id,NEW.job_id);
  END IF;
 END IF;
 IF applies THEN
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN
  RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' USING ERRCODE='P0001', DETAIL=(SELECT jsonb_build_object('version','job-linked-offer.v1','code','POST_LOCK_WORK_REQUIRES_LINKED_JOB','message','Start a linked job for this customer and site','jobId',NEW.job_id,'customerId',b.customer_id,'siteId',b.site_id)::text FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id) WHERE c.tenant_id=NEW.tenant_id AND c.job_id=NEW.job_id);
 END IF;
 PERFORM app.ch4_require_open(NEW.tenant_id,NEW.job_id);
 END IF;
 IF maintenance THEN
  DELETE FROM control_plane.lp11_maintenance_job WHERE transaction_id=pg_current_xact_id_if_assigned();
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.job_source_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.ch4_require_open(NEW.tenant_id,NEW.job_id);
 IF app.lp6d_maintenance_login() THEN PERFORM app.lp11_watchdog_live_maintenance(NEW.tenant_id,NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.serialize_final_check_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE maintenance boolean:=app.lp6d_maintenance_login();
BEGIN
 IF maintenance THEN
  PERFORM app.lp11_open_maintenance_job(NEW.tenant_id,NEW.job_id);
 ELSIF NEW.tenant_id IS DISTINCT FROM coalesce(app.lp11_policy_tenant(),app.lp11_delegated_job_tenant(NEW.job_id)) THEN
  -- A privileged caller may have supplied this exact upload to the trigger.
  -- Preserve the verified-upload denial from the later watchdog trigger,
  -- without doing an unbound read or relaxing the ordinary binding check.
  IF TG_TABLE_NAME='evidence_upload' AND TG_OP='UPDATE' THEN
   IF OLD.state='verified' AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') THEN
    RAISE EXCEPTION 'verified evidence upload is immutable' USING ERRCODE='42501';
   END IF;
  END IF;
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- A shared marker identifies only this tenant/job's in-flight uploads on a bounded lock timeout.
 -- It never conflicts with another upload or acquires a business lock.
 IF TG_TABLE_NAME='evidence_upload' THEN
  PERFORM pg_advisory_xact_lock_shared(hashtext('final_check_upload:'||NEW.tenant_id::text),hashtext(NEW.job_id::text));
 END IF;
 -- SHARE matches the watchdog live guard and blocks the exclusive lock/freeze/publication
 -- without upgrading concurrent evidence commands from SHARE to UPDATE.
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
 IF TG_TABLE_NAME='evidence_upload' THEN
  IF TG_OP='UPDATE' AND OLD.state='verified' AND NEW.state IS DISTINCT FROM OLD.state
   AND (current_setting('transaction_isolation')<>'read committed'
    OR EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=OLD.tenant_id AND job_id=OLD.job_id)) THEN
   RAISE EXCEPTION 'FINAL_CHECK_VERIFIED_SOURCE_LOCKED' USING ERRCODE='55000';
  END IF;
  -- Preserve supplied receipts. A later insert cannot claim a place before an existing lock.
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND NEW.server_received_at<=locked_at) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='55000';
  ELSIF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.server_received_at,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.server_received_at,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.kind='original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.upload_id) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='23503'; END IF;
 END IF;
 IF maintenance THEN DELETE FROM control_plane.lp11_maintenance_job WHERE transaction_id=pg_current_xact_id_if_assigned(); END IF;
 RETURN NEW;
END $$;

-- A consumed, verified challenge and its locked invitation are the authority
-- to read the issuer and previous invitee membership and add one replacement.
CREATE UNLOGGED TABLE control_plane.lp11_invitation_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 account_id uuid NOT NULL,
 issuer_user_id uuid NOT NULL,
 invited_user_id uuid,
 new_membership_id uuid NOT NULL,
 role varchar NOT NULL
);
ALTER TABLE control_plane.lp11_invitation_scope OWNER TO jobguard_migration;
REVOKE ALL ON TABLE control_plane.lp11_invitation_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_invitation_membership(t uuid,a uuid,m uuid,u uuid,r varchar,proposed boolean) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM control_plane.lp11_invitation_scope s
  WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.tenant_id=t
   AND CASE WHEN proposed THEN
    (s.account_id,s.new_membership_id,s.invited_user_id,s.role)=(a,m,u,r)
   ELSE (s.issuer_user_id=u AND s.account_id=a) OR s.invited_user_id=u END)
$$;
ALTER FUNCTION app.lp11_invitation_membership(uuid,uuid,uuid,uuid,varchar,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_invitation_membership(uuid,uuid,uuid,uuid,varchar,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_invitation_membership(uuid,uuid,uuid,uuid,varchar,boolean) TO jobguard_runtime;

CREATE FUNCTION app.lp11_invitation_tenant() RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_invitation_scope s WHERE s.transaction_id=pg_current_xact_id_if_assigned()
$$;
ALTER FUNCTION app.lp11_invitation_tenant() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_invitation_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_invitation_tenant() TO jobguard_runtime;

CREATE OR REPLACE FUNCTION identity.provision_verified_challenge(challenge_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE c identity.challenge; i identity.invitation; l identity.membership_locator; u uuid; t uuid; a uuid; m uuid; issuer uuid;
BEGIN
 SELECT * INTO c FROM identity.challenge WHERE id=challenge_id FOR UPDATE;
 IF NOT FOUND OR NOT c.verified OR c.consumed_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'invalid challenge' USING ERRCODE='22023';
 END IF;
 -- Consume the authorization latch on every outcome, including unknown signin/invitation.
 UPDATE identity.challenge SET verified=false WHERE id=c.id;
 SELECT user_id INTO u FROM identity.user_email WHERE email=c.email;
 IF c.purpose='signin' AND u IS NULL THEN RETURN NULL; END IF;
 IF c.purpose='invitation' THEN
  -- Match the contractor command lock before checking membership reuse.
  SELECT tenant_id INTO t FROM identity.invitation WHERE id=c.invitation_id AND email=c.email;
  IF t IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54)); END IF;
  SELECT * INTO i FROM identity.invitation WHERE id=c.invitation_id AND email=c.email
   AND accepted_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF app.lp6e_request_binding_present() AND i.tenant_id IS DISTINCT FROM app.current_tenant() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  IF NOT (SELECT allowed FROM identity.sso_invitation_accept_allowed(i.id)) THEN RETURN NULL; END IF;
  m:=gen_random_uuid();
  INSERT INTO control_plane.lp11_invitation_scope VALUES
   (pg_current_xact_id(),i.tenant_id,i.account_id,i.issuer_user_id,u,m,i.role);
  PERFORM set_config('app.tenant_id',i.tenant_id::text,true);
  SELECT member_row.id INTO issuer FROM app.membership member_row WHERE member_row.tenant_id=i.tenant_id AND member_row.identity_user_id=i.issuer_user_id AND member_row.account_id=i.account_id
   AND member_row.role='owner' AND member_row.revoked_at IS NULL AND(member_row.expires_at IS NULL OR member_row.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=i.tenant_id AND r.membership_id=member_row.id)
   ORDER BY member_row.id LIMIT 1;
  IF issuer IS NULL THEN
   DELETE FROM control_plane.lp11_invitation_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
   RETURN NULL;
  END IF;
  IF i.role='operative' THEN
   IF NOT (app.lp6d_mon8_feature_decision(issuer,'operative_roles')->>'executable')::boolean OR c.expires_at<=clock_timestamp() THEN
    DELETE FROM control_plane.lp11_invitation_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
    RETURN NULL;
   END IF;
  END IF;
 END IF;
 IF u IS NULL THEN
  u:=gen_random_uuid();
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(c.email,u);
  IF c.purpose='signup' THEN
   t:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid();
   INSERT INTO control_plane.tenant(id) VALUES(t);
   PERFORM set_config('app.tenant_id',t::text,true);
   INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'New business');
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
   INSERT INTO identity.membership_locator VALUES(u,t,m);
  END IF;
 END IF;
 IF c.purpose='invitation' THEN
  UPDATE control_plane.lp11_invitation_scope SET invited_user_id=u WHERE transaction_id=pg_current_xact_id_if_assigned();
  -- The locator outlives revocation and expiry, so it is not itself a reason to refuse. Lock it, then lock the linked
  -- membership: only a currently ACTIVE membership blocks a fresh invitation (the invitation then stays unused).
  SELECT * INTO l FROM identity.membership_locator WHERE user_id=u AND tenant_id=i.tenant_id FOR UPDATE;
  IF FOUND THEN
   PERFORM 1 FROM app.membership WHERE tenant_id=l.tenant_id AND id=l.membership_id AND identity_user_id=u
    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
     WHERE r.tenant_id=l.tenant_id AND r.membership_id=l.membership_id) FOR SHARE;
   IF FOUND THEN
    DELETE FROM control_plane.lp11_invitation_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
    RETURN NULL;
   END IF;
   -- Inactive: add the invitation-bound replacement and repoint the locator atomically. The revoked or expired
   -- membership row is kept untouched as history (audit rows keep referring to it).
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   UPDATE identity.membership_locator SET membership_id=m WHERE user_id=u AND tenant_id=i.tenant_id;
  ELSE
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   INSERT INTO identity.membership_locator VALUES(u,i.tenant_id,m);
  END IF;
  UPDATE identity.invitation SET accepted_at=clock_timestamp() WHERE id=i.id;
  DELETE FROM control_plane.lp11_invitation_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 END IF;
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'identity.verified',c.id,clock_timestamp());
 RETURN u;
END $$;

-- Keep the binding check outside LP-6's refusing accessor for an empty pool transaction.
CREATE FUNCTION app.lp11_delegated_job_tenant(j uuid) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT app.lp6e_request_binding_present() THEN RETURN NULL; END IF;
 RETURN (SELECT b.tenant_id FROM app.lp6_bound_request() b
  WHERE b.credential_kind='customer_portal_delegated'
   AND b.scope_command_type='JobSource.customer_message' AND b.scope_job_id=j);
END $$;
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
ALTER FUNCTION app.lp11_delegated_job_tenant(uuid) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp11_delegated_job_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_delegated_job_tenant(uuid) TO jobguard_migration,jobguard_runtime,jobguard_command_writer;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;

-- Customer credentials are scoped to the matching grant and session and only
-- the job they delegate. The private lookup owner cannot write either table.
GRANT CREATE ON SCHEMA app,control_plane TO jobguard_session_lookup;
CREATE UNLOGGED TABLE control_plane.lp11_customer_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 lookup_digest text,
 lookup_kind text,
 grant_id uuid,
 session_id uuid,
 issuer_membership_id uuid,
 command_id uuid,
 purpose text,
 variation_id uuid,
 variation_scope_item_id uuid
);
ALTER TABLE control_plane.lp11_customer_scope OWNER TO jobguard_session_lookup;
REVOKE ALL ON TABLE control_plane.lp11_customer_scope FROM PUBLIC;
GRANT SELECT ON app.customer_portal_grant,app.customer_portal_session TO jobguard_session_lookup;
CREATE FUNCTION app.lp11_customer_match(t uuid,j uuid,c uuid,d text,k text) RETURNS boolean
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM control_plane.lp11_customer_scope x
  WHERE x.transaction_id=pg_current_xact_id_if_assigned()
   AND (x.tenant_id,x.job_id,x.customer_id,x.lookup_digest,x.lookup_kind)=(t,j,c,d,k))
$$;
ALTER FUNCTION app.lp11_customer_match(uuid,uuid,uuid,text,text) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_customer_match(uuid,uuid,uuid,text,text) FROM PUBLIC;
CREATE POLICY lp11_customer_credential ON app.customer_portal_grant FOR SELECT TO jobguard_session_lookup
 USING (app.lp11_customer_match(tenant_id,job_id,customer_id,token_digest,'redeem'));
CREATE POLICY lp11_customer_credential ON app.customer_portal_session FOR SELECT TO jobguard_session_lookup
 USING (app.lp11_customer_match(tenant_id,job_id,customer_id,token_digest,'session'));

CREATE FUNCTION app.lp11_open_customer_scope(t uuid,j uuid,c uuid,d text,operation text,new_session uuid DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scope control_plane.lp11_customer_scope; g uuid; s uuid; sponsor uuid;
BEGIN
 IF t IS NULL OR j IS NULL OR c IS NULL OR d IS NULL OR d !~ '^[0-9a-f]{64}$'
  OR current_database()<>'jobguard_synthetic_demo' OR operation IS NULL OR operation NOT IN('redeem','resolve','signout') THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO scope FROM control_plane.lp11_customer_scope x WHERE x.transaction_id=pg_current_xact_id_if_assigned();
 IF FOUND THEN
  IF (scope.tenant_id,scope.job_id,scope.customer_id,scope.lookup_digest,scope.lookup_kind)
     IS DISTINCT FROM (t,j,c,d,'authorized_session'::text) OR operation<>'resolve' THEN
   RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
  END IF;
  RETURN false;
 END IF;
 IF app.lp11_policy_tenant() IS NOT NULL AND t IS DISTINCT FROM app.lp11_policy_tenant() THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 INSERT INTO control_plane.lp11_customer_scope VALUES
  (pg_current_xact_id(),t,j,c,d,CASE WHEN operation='redeem' THEN 'redeem' ELSE 'session' END,NULL,NULL,NULL,NULL);
 IF operation='redeem' THEN
  SELECT rowdata.id,rowdata.issuer_membership_id INTO g,sponsor FROM app.customer_portal_grant rowdata
   WHERE (rowdata.tenant_id,rowdata.job_id,rowdata.customer_id,rowdata.token_digest)=(t,j,c,d)
    AND rowdata.revoked_at IS NULL AND rowdata.consumed_at IS NULL AND rowdata.expires_at>clock_timestamp();
  s:=new_session;
 ELSE
  SELECT rowdata.id,rowdata.grant_id INTO s,g FROM app.customer_portal_session rowdata
   WHERE (rowdata.tenant_id,rowdata.job_id,rowdata.customer_id,rowdata.token_digest)=(t,j,c,d)
    AND rowdata.revoked_at IS NULL AND rowdata.expires_at>clock_timestamp();
 END IF;
 IF g IS NULL OR s IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 UPDATE control_plane.lp11_customer_scope x SET
  grant_id=g,session_id=s,issuer_membership_id=sponsor,
  lookup_kind=CASE WHEN operation='redeem' THEN 'authorized_link' ELSE 'authorized_session' END
 WHERE x.transaction_id=pg_current_xact_id_if_assigned();
 RETURN true;
END $$;
ALTER FUNCTION app.lp11_open_customer_scope(uuid,uuid,uuid,text,text,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_open_customer_scope(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_open_customer_scope(uuid,uuid,uuid,text,text,uuid) TO jobguard_migration,jobguard_binding_owner;

CREATE FUNCTION app.lp11_customer_tenant(resource text,id uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT x.tenant_id FROM control_plane.lp11_customer_scope x
 WHERE x.transaction_id=pg_current_xact_id_if_assigned()
  AND x.lookup_kind IN ('authorized_link','authorized_session')
  AND CASE resource WHEN 'job' THEN x.job_id=id
   WHEN 'customer' THEN x.customer_id=id WHEN 'grant' THEN x.grant_id=id
   WHEN 'session' THEN x.session_id=id
   WHEN 'issuer' THEN x.issuer_membership_id=id
   WHEN 'command' THEN x.command_id=id
   WHEN 'stage_job' THEN x.purpose='stage' AND x.job_id=id
   WHEN 'stage_customer' THEN x.purpose='stage' AND x.customer_id=id
   WHEN 'stage_session' THEN x.purpose='stage' AND x.session_id=id
   WHEN 'stage_command' THEN x.purpose='stage' AND x.command_id=id
   WHEN 'billing_job' THEN x.purpose='billing' AND x.job_id=id
   WHEN 'variation_job' THEN x.purpose='variation' AND x.job_id=id
   WHEN 'variation_target' THEN x.purpose='variation' AND x.variation_id=id
   WHEN 'variation_scope_item' THEN x.purpose='variation' AND x.variation_scope_item_id=id
   WHEN 'variation_session' THEN x.purpose='variation' AND x.session_id=id
   WHEN 'variation_command' THEN x.purpose='variation' AND x.command_id=id
   WHEN 'audit' THEN id IS NULL ELSE false END
$$;
ALTER FUNCTION app.lp11_customer_tenant(text,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_customer_tenant(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_customer_tenant(text,uuid) TO jobguard_migration,jobguard_binding_owner,jobguard_audit_writer,jobguard_runtime,jobguard_command_writer;

CREATE FUNCTION app.lp11_customer_sponsor(g uuid,m uuid) RETURNS void
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 UPDATE control_plane.lp11_customer_scope x SET issuer_membership_id=m
 WHERE x.transaction_id=pg_current_xact_id_if_assigned() AND x.grant_id=g
  AND x.lookup_kind='authorized_session' AND x.issuer_membership_id IS NULL
$$;
ALTER FUNCTION app.lp11_customer_sponsor(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_customer_sponsor(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_customer_sponsor(uuid,uuid) TO jobguard_migration;

CREATE FUNCTION app.lp11_customer_command(cid uuid) RETURNS void
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 UPDATE control_plane.lp11_customer_scope x SET command_id=cid
 WHERE x.transaction_id=pg_current_xact_id_if_assigned()
  AND x.lookup_kind='authorized_session' AND x.command_id IS NULL
$$;
ALTER FUNCTION app.lp11_customer_command(uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_customer_command(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_customer_command(uuid) TO jobguard_migration;

CREATE FUNCTION app.lp11_close_customer_scope() RETURNS void
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DELETE FROM control_plane.lp11_customer_scope x WHERE x.transaction_id=pg_current_xact_id_if_assigned()
$$;
ALTER FUNCTION app.lp11_close_customer_scope() OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_close_customer_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_close_customer_scope() TO jobguard_migration,jobguard_binding_owner;

-- Stage proofs and variations are visible only after authorization for this job.
CREATE FUNCTION app.lp11_customer_operation(operation text) RETURNS void
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 UPDATE control_plane.lp11_customer_scope x SET purpose=operation
 WHERE x.transaction_id=pg_current_xact_id_if_assigned() AND x.lookup_kind='authorized_session'
  AND x.purpose IS NULL AND operation IN('stage','variation','billing')
$$;
ALTER FUNCTION app.lp11_customer_operation(text) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_customer_operation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_customer_operation(text) TO jobguard_migration;

CREATE FUNCTION app.lp11_customer_variation_target(v uuid,s uuid DEFAULT NULL) RETURNS void
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 UPDATE control_plane.lp11_customer_scope x SET variation_id=v,variation_scope_item_id=s
 WHERE x.transaction_id=pg_current_xact_id_if_assigned() AND x.purpose='variation'
  AND (x.variation_id IS NULL OR x.variation_id=v)
$$;
ALTER FUNCTION app.lp11_customer_variation_target(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_customer_variation_target(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_customer_variation_target(uuid,uuid) TO jobguard_migration;
REVOKE CREATE ON SCHEMA app,control_plane FROM jobguard_session_lookup;

CREATE OR REPLACE FUNCTION app.customer_portal_issuer(t uuid,digest text) RETURNS app.membership
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s identity.session; m app.membership; actor uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT app.lp6e_request_binding_present() THEN
  BEGIN
   PERFORM app.bind_request('real',digest,t);
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM IS DISTINCT FROM 'REQUEST_BINDING_REFUSED' THEN RAISE; END IF;
   RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
  END;
 END IF;
 SELECT id INTO actor FROM identity.sso_session_memberships(s.user_id,s.id) WHERE tenant_id=t AND role IN('owner','finance');
 IF t IS DISTINCT FROM app.current_tenant() OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor AND role IN('owner','finance') AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

CREATE OR REPLACE FUNCTION identity.customer_portal_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g app.customer_portal_grant; s app.customer_portal_session; ts timestamptz; sid uuid:=gen_random_uuid(); opened boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR operation NOT IN('redeem','resolve','signout') OR operation IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 opened:=app.lp11_open_customer_scope(t,j,c,digest,operation,sid);
 IF operation='redeem' THEN
  SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest FOR UPDATE;
 ELSE
  SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest FOR UPDATE;
  SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND id=s.grant_id FOR UPDATE;
 END IF;
 IF g.id IS NOT NULL THEN PERFORM app.lp11_customer_sponsor(g.id,g.issuer_membership_id); END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 -- Lock current party before the final authority/clock check; stale authority never survives a wait.
 PERFORM 1 FROM app.job_party_current WHERE tenant_id=t AND job_id=j FOR SHARE;
 PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
 IF g.quote_document_id IS NOT NULL THEN
  -- Fence a blank-firm reset through commit; recheck expiry/revocation below.
  PERFORM 1 FROM control_plane.practice_session p JOIN app.job own_job ON own_job.practice_session_digest=p.token_digest
   WHERE own_job.tenant_id=t AND own_job.id=j FOR SHARE OF p;
 END IF;
 ts:=clock_timestamp();
 IF g.id IS NULL OR NOT app.customer_portal_current(g) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF operation='redeem' THEN
  IF g.consumed_at IS NOT NULL OR g.expires_at<=ts OR session_digest IS NULL OR session_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  UPDATE app.customer_portal_grant SET consumed_at=ts WHERE tenant_id=t AND id=g.id;
  INSERT INTO app.customer_portal_session(tenant_id,id,job_id,customer_id,grant_id,token_digest,issued_at,expires_at) VALUES(t,sid,j,c,g.id,session_digest,ts,ts+interval '1 hour');
  PERFORM app.customer_portal_audit(t,sid,'signed_in');
 ELSIF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=ts THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 ELSIF operation='signout' THEN
  UPDATE app.customer_portal_session SET revoked_at=ts WHERE tenant_id=t AND id=s.id;
  PERFORM app.customer_portal_audit(t,s.id,'signed_out');
 END IF;
 IF opened THEN PERFORM app.lp11_close_customer_scope(); END IF;
 RETURN jsonb_build_object('version','customer-session.v1','jobId',j,'customerId',c,'companyId',g.company_id);
END $$;

-- Latest definition: 0633_customer_practice_pay_now_read.sql. Reuse the
-- customer portal's locked grant, session, sponsor and current-party checks.
CREATE OR REPLACE FUNCTION identity.customer_practice_pay_now(t uuid,j uuid,c uuid,digest text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 -- Resolve checks the session, grant, sponsor and current customer/job binding
 -- before any invoice read, holding the existing portal locks until return.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp11_customer_operation('billing');
 SELECT jsonb_build_object('invoiceNumber',i.invoice_number,'balancePence',greatest(0,i.total_pence
  -coalesce((SELECT sum(n.amount_pence) FROM app.customer_credit_note n WHERE n.tenant_id=t AND n.invoice_id=i.id),0)
  -coalesce((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE p.tenant_id=t AND p.invoice_id=i.id
   AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.payment_id=p.id)),0)))
 INTO result FROM app.customer_invoice i WHERE i.tenant_id=t AND i.job_id=j AND i.synthetic
 ORDER BY i.issued_on DESC,i.invoice_number DESC LIMIT 1;
 IF result IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_close_customer_scope();
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION identity.customer_portal_quote(t uuid,j uuid,c uuid,digest text,cmd jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job app.job; d app.quote_document_version; s app.customer_portal_session; g app.customer_portal_grant;
 prior app.customer_quote_approval; aid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); previous_id uuid; previous_seq integer;
 result jsonb; target jsonb; ts timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR cmd IS NULL OR jsonb_typeof(cmd)<>'object'
  OR cmd->>'jobId' IS DISTINCT FROM j::text OR cmd->>'version' IS NULL
  OR cmd->>'version' NOT IN('customer-quote-read.v1','customer-quote-acceptance.v1')
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 -- Authenticate before touching a requested job. Then use 0155's job lock and
 -- the draft lock used by saveDraft, and recheck authority/clock after any wait.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO job FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND id=s.grant_id;
 IF cmd->>'version'='customer-quote-read.v1' THEN
  IF cmd<>jsonb_build_object('version','customer-quote-read.v1','jobId',j::text) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 ELSE
  target:=cmd->'target';
  IF cmd IS DISTINCT FROM jsonb_build_object('version','customer-quote-acceptance.v1','commandId',(cmd->>'commandId')::uuid::text,'jobId',j::text,'expectedJobRevision',(cmd->>'expectedJobRevision')::integer,'target',jsonb_build_object('kind','quote','id',(target->>'id')::uuid::text,'revision',(target->>'revision')::integer,'hash',target->>'hash'))
   OR (cmd->>'commandId') IS NULL OR cmd->>'expectedJobRevision' IS NULL OR (cmd->>'expectedJobRevision')::integer<1
   OR target->>'id' IS NULL OR target->>'revision' IS NULL OR (target->>'revision')::integer<1 OR target->>'hash' IS NULL OR target->>'hash' !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||(cmd->>'commandId'),388));
  PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
  SELECT * INTO prior FROM app.customer_quote_approval WHERE tenant_id=t AND command_id=(cmd->>'commandId')::uuid;
  IF prior.command_id IS NOT NULL THEN
   IF prior.job_id<>j OR prior.customer_id<>c OR prior.command<>cmd THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
   PERFORM app.lp11_close_customer_scope();
   RETURN prior.result;
  END IF;
 END IF;
 -- Only the latest issued document, from the current quote revision AND current customer binding.
 SELECT doc.* INTO d FROM app.quote_document_version doc
 JOIN app.quote_revision qr ON(qr.tenant_id,qr.job_id,qr.id)=(doc.tenant_id,doc.job_id,doc.quote_revision_id)
 JOIN app.quote_draft draft ON(draft.tenant_id,draft.job_id,draft.current_revision_id)=(qr.tenant_id,qr.job_id,qr.id)
 WHERE doc.tenant_id=t AND doc.job_id=j AND (g.quote_document_id IS NULL OR doc.id=g.quote_document_id)
 AND doc.snapshot->'jobParties'->>'bindingId'=g.party_binding_id::text
 AND doc.snapshot->'jobParties'->>'customerRevisionId'=g.customer_revision_id::text
 AND EXISTS(SELECT 1 FROM app.quote_send send WHERE send.tenant_id=t AND send.job_id=j AND send.document_id=doc.id AND send.content_hash=doc.content_hash)
 AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=t AND newer.job_id=j AND newer.document_version>doc.document_version)
 AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=doc.id AND e.kind='superseded')
 ORDER BY doc.document_version DESC LIMIT 1;
 IF cmd->>'version'='customer-quote-read.v1' THEN
  PERFORM app.lp11_close_customer_scope();
  RETURN jsonb_build_object('version','customer-quote-view.v1','jobId',j,'jobRevision',job.revision,'status',job.status,'quote',
   CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'revision',d.document_version,'hash',d.content_hash,'document',d.snapshot) END);
 END IF;
 IF d.id IS NULL OR job.status<>'quoting' OR job.revision<>(cmd->>'expectedJobRevision')::integer
  OR d.id<>(target->>'id')::uuid OR d.document_version<>(target->>'revision')::integer OR d.content_hash<>target->>'hash'
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Preserve 0155's cancellation, reacceptance and billing guards, using its latest body.
 SELECT a.id,coalesce(qs.acceptance_sequence,1) INTO previous_id,previous_seq FROM app.quote_acceptance a
 LEFT JOIN app.quote_acceptance_sequence qs ON qs.tenant_id=a.tenant_id AND qs.acceptance_id=a.id
 WHERE a.tenant_id=t AND a.job_id=j AND a.document_id=d.id
 ORDER BY coalesce(qs.acceptance_sequence,1) DESC,a.recorded_at DESC,a.id DESC LIMIT 1;
 IF previous_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=d.id AND e.kind='acceptance_cancelled' AND e.acceptance_id=previous_id)
   OR EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j)
   OR EXISTS(SELECT 1 FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j)
   OR EXISTS(SELECT 1 FROM app.customer_payment WHERE tenant_id=t AND job_id=j)
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 ts:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM app.quote_version WHERE tenant_id=t AND id=d.id) THEN
  INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status)
  VALUES(d.id,t,j,d.document_version,d.content_hash,(d.snapshot->>'netPence')::bigint,'accepted');
 END IF;
 INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at,evidence_id)
 VALUES(aid,t,j,d.id,d.document_version,d.content_hash,(d.snapshot->>'totalPence')::bigint,'GBP','customer_authenticated',NULL,d.snapshot->'customer'->>'name','customer_portal',ts,NULL);
 INSERT INTO app.quote_acceptance_sequence(tenant_id,job_id,document_id,acceptance_id,acceptance_sequence,replaces_acceptance_id)
 VALUES(t,j,d.id,aid,coalesce(previous_seq,0)+1,previous_id);
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at)
 VALUES(eid,t,j,d.id,d.document_version,d.content_hash,aid,'accepted',NULL,ts);
 UPDATE app.job SET status='accepted',revision=revision+1,accepted_quote_version_id=d.id,updated_at=ts WHERE tenant_id=t AND id=j;
 result:=jsonb_build_object('version','customer-quote-accepted.v1','acceptanceId',aid,'jobId',j,'target',target,'method','customer_authenticated');
 INSERT INTO app.customer_quote_approval(tenant_id,command_id,job_id,acceptance_id,session_id,customer_id,party_binding_id,command,result)
 VALUES(t,(cmd->>'commandId')::uuid,j,aid,s.id,c,g.party_binding_id,cmd,result);
 -- Customer session is the actor; only immutable identifiers/hash enter the sealed audit payload.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','customer-session:'||s.id::text,
  'eventType','quote.acceptance.customer_authenticated','subjectType','quote_document','subjectRef',d.id::text,
  'payload',jsonb_build_object('references',jsonb_build_object('acceptanceId',aid::text,'acceptanceEventId',eid::text),'hashes',jsonb_build_object('documentHash',d.content_hash),'classifications',jsonb_build_object('action','commercial')))),'checked_operation');
 PERFORM app.lp11_close_customer_scope();
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
END $$;

CREATE OR REPLACE FUNCTION app.lp6_bind_customer_portal(t uuid,j uuid,c uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app.customer_portal_session; sponsor uuid; opened boolean;
 environment_key text:=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database());
 request_xid xid8:=pg_current_xact_id();
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.request_binding b
  WHERE b.environment_id IS NOT DISTINCT FROM environment_key AND b.transaction_id IS NOT DISTINCT FROM request_xid) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- Re-resolve even when invoked by another migration-owned definer. A caller's
 -- tenant setting, sponsor hint or earlier resolve is never authority.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 opened:=app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO s FROM app.customer_portal_session p
  WHERE p.tenant_id IS NOT DISTINCT FROM t AND p.job_id IS NOT DISTINCT FROM j
   AND p.customer_id IS NOT DISTINCT FROM c AND p.token_digest IS NOT DISTINCT FROM digest
   AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp();
 SELECT g.issuer_membership_id INTO sponsor FROM app.customer_portal_grant g
  WHERE g.tenant_id IS NOT DISTINCT FROM t AND g.id IS NOT DISTINCT FROM s.grant_id
   AND g.job_id IS NOT DISTINCT FROM j AND g.customer_id IS NOT DISTINCT FROM c AND g.revoked_at IS NULL;
 IF s.id IS NULL OR sponsor IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at,scope_job_id,scope_command_type)
 VALUES(environment_key,request_xid,'customer_portal_delegated',s.id::text,t,sponsor,
  least(s.expires_at,clock_timestamp()+interval '1 minute'),j,'JobSource.customer_message');
 IF opened THEN PERFORM app.lp11_close_customer_scope(); END IF;
 RETURN sponsor;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_action_allowed(c uuid,s uuid,m uuid,permission text,target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE requested uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; t uuid; permitted boolean; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN false; END IF;
 t:=identity.lp11_open_sso_scope(c,'worker_authorize');
 IF t IS DISTINCT FROM requested THEN
  DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN false;
 END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT EXISTS(
  SELECT 1 FROM identity.sso_session_binding b JOIN identity.sso_subject sub ON(sub.tenant_id,sub.connection_id,sub.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash)
  JOIN identity.session se ON se.id=b.session_id
  WHERE b.tenant_id=t AND b.connection_id=c AND b.session_id=s AND sub.membership_id=m AND se.user_id=sub.user_id AND se.environment='synthetic_demo'
  AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp() AND app.contractor_allowed(m,permission,target)) INTO permitted;
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN permitted;
END $$;

CREATE OR REPLACE FUNCTION identity.customer_portal_message(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; sid uuid; existed boolean;
BEGIN
 -- Resolve before looking at command history. Same advisory lock as sign-in/revoke,
 -- retained through the writer, so revoke/rebind cannot race a stale successful write.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp6_bind_customer_portal(t,j,c,digest);
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'version' IS DISTINCT FROM 'customer-portal-message.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>4
  OR NOT input ?& ARRAY['version','jobId','commandId','text'] OR input->>'jobId' IS DISTINCT FROM j::text
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_customer_command((input->>'commandId')::uuid);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT id INTO sid FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=(input->>'commandId')::uuid) INTO existed;
 result:=app.lp6d_customer_message_source(t,j,'customer:'||c::text||':'||digest,'customer_message',
  jsonb_build_object('version','customer-message-input.v1','commandId',input->>'commandId','text',input->'text',
   'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name','Fictional customer')));
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 IF NOT existed THEN
  PERFORM app.append_final_check_audit(gen_random_uuid(),'customer-session:'||sid::text,j,'customer_portal.message_recorded',
   jsonb_build_object('commandId',input->>'commandId','customerId',c,'sessionId',sid,'sourceId',result->'record'->>'id'));
 END IF;
 -- Builder storage/receipts retain the sponsor; redact only the customer result,
 -- including authorized replays of the original stored receipt.
 -- No signal access, counts, detector scheduling or inferred approval/price in this path.
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM app.lp11_close_customer_scope();
 RETURN result #- '{record,actualTesterMembershipId}';
END $$;

-- Customer stage acknowledgement retains the checked portal job through its upload lock and replay.
CREATE OR REPLACE FUNCTION identity.customer_stages(t uuid,j uuid,c uuid,digest text,completion uuid,command uuid,expected_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.stage_completion; prior app.customer_stage_acknowledgement; view jsonb; sid uuid; ack uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 -- Reuse the existing authority boundary inside this transaction, including its job lock.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp11_customer_operation('stage');
 SELECT id INTO sid FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 IF completion IS NULL THEN
  IF command IS NOT NULL OR expected_hash IS NOT NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  view:=jsonb_build_object('version','customer-stages.v1','jobId',j,'stages',coalesce((
   SELECT jsonb_agg(app.customer_stage_snapshot(t,j,x.id)||jsonb_build_object('acknowledgement',
    (SELECT jsonb_build_object('id',a.id,'snapshotHash',a.snapshot_hash,'acknowledgedAt',a.acknowledged_at)
     FROM app.customer_stage_acknowledgement a WHERE a.tenant_id=t AND a.customer_id=c AND a.completion_id=x.id)) ORDER BY x.completed_at,x.id)
   FROM app.stage_completion x WHERE x.tenant_id=t AND x.job_id=j),'[]'::jsonb));
  PERFORM app.lp11_close_customer_scope();
  RETURN view;
 END IF;
 IF command IS NULL OR expected_hash IS NULL OR expected_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':customer-stage-command:'||command::text,390));
 SELECT * INTO prior FROM app.customer_stage_acknowledgement WHERE tenant_id=t AND command_id=command;
 IF prior.id IS NOT NULL THEN
  IF prior.job_id<>j OR prior.customer_id<>c OR prior.completion_id<>completion OR prior.snapshot_hash<>expected_hash THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM app.lp11_close_customer_scope();
  RETURN jsonb_build_object('version','customer-stage-acknowledged.v1','id',prior.id,'snapshotHash',prior.snapshot_hash);
 END IF;
 SELECT * INTO s FROM app.stage_completion WHERE tenant_id=t AND job_id=j AND id=completion;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Match proof.complete's lock, then proof.invalidate's upload lock. No audit lock until the end.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text||':'||s.scope_item_id::text||':'||s.stage,0));
 PERFORM 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id)
 JOIN app.evidence_link l ON(l.tenant_id,l.evidence_id)=(e.tenant_id,e.id)
 WHERE l.tenant_id=t AND l.id=s.evidence_link_id FOR UPDATE OF u;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 view:=app.customer_stage_snapshot(t,j,completion);
 IF view IS NULL OR (view->>'reviewRequired')::boolean IS DISTINCT FROM false OR view->>'hash'<>expected_hash THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_stage_acknowledgement WHERE tenant_id=t AND customer_id=c AND completion_id=completion) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO app.customer_stage_acknowledgement(tenant_id,id,job_id,customer_id,session_id,completion_id,command_id,snapshot,snapshot_hash)
 VALUES(t,ack,j,c,sid,completion,command,view->'snapshot',expected_hash);
 PERFORM app.lp11_customer_command(ack);
 PERFORM app.customer_portal_audit(t,ack,'stage_acknowledged');
 PERFORM app.lp11_close_customer_scope();
 RETURN jsonb_build_object('version','customer-stage-acknowledged.v1','id',ack,'snapshotHash',expected_hash);
END $$;

-- Customer variation approvals reuse the authenticated portal job and exact command.
CREATE OR REPLACE FUNCTION identity.customer_variation(t uuid,j uuid,c uuid,digest text,command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.customer_portal_session; v app.variation; r app.variation_revision; a app.variation_approval;
 job app.job; provenance app.customer_variation_approval; target jsonb; request_hash text; result jsonb; cmd uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp11_customer_operation('variation');
 SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT * INTO job FROM app.job WHERE tenant_id=t AND id=j;
 IF command IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',var.id,'revision',rev.revision,'hash',rev.content_hash,'description',rev.description,
   'amount',jsonb_build_object('pence',rev.signed_delta_pence,'currency','GBP'),'approved',approval.id IS NOT NULL,'method',approval.method) ORDER BY var.id),'[]'::jsonb) INTO result
  FROM app.variation var JOIN app.variation_revision rev ON(rev.tenant_id,rev.job_id,rev.variation_id,rev.id)=(var.tenant_id,var.job_id,var.id,var.current_revision_id)
  LEFT JOIN app.variation_approval approval ON(approval.tenant_id,approval.revision_id)=(rev.tenant_id,rev.id)
  WHERE var.tenant_id=t AND var.job_id=j AND var.state IN('priced','approved');
  PERFORM app.lp11_close_customer_scope();
  RETURN jsonb_build_object('version','customer-variations.v1','jobId',j,'jobRevision',job.revision,'variations',result);
 END IF;
 target:=(command->'target');
 -- Revalidate the strict envelope at the SQL boundary; the identity role cannot bypass HTTP validation.
 IF jsonb_typeof(command) IS DISTINCT FROM 'object' OR (command-ARRAY['version','commandId','jobId','expectedJobRevision','target'])<>'{}'::jsonb
  OR (command->>'version') IS DISTINCT FROM 'customer-portal-approval.v1' OR (command->>'jobId')::uuid IS DISTINCT FROM j
  OR jsonb_typeof(command->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(command->'jobId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(command->'expectedJobRevision') IS DISTINCT FROM 'number' OR (command->>'expectedJobRevision') !~ '^(0|[1-9][0-9]*)$'
  OR jsonb_typeof(target) IS DISTINCT FROM 'object' OR (target-ARRAY['kind','id','revision','hash','amount'])<>'{}'::jsonb
  OR (target->>'kind') IS DISTINCT FROM 'variation' OR jsonb_typeof(target->'id') IS DISTINCT FROM 'string'
  OR jsonb_typeof(target->'revision') IS DISTINCT FROM 'number' OR (target->>'revision') !~ '^[1-9][0-9]*$'
  OR jsonb_typeof(target->'hash') IS DISTINCT FROM 'string' OR (target->>'hash') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(target->'amount') IS DISTINCT FROM 'object' OR ((target->'amount')-ARRAY['pence','currency'])<>'{}'::jsonb
  OR (target->'amount'->>'currency') IS DISTINCT FROM 'GBP' OR jsonb_typeof(target->'amount'->'pence') IS DISTINCT FROM 'number'
  OR (target->'amount'->>'pence') !~ '^-?(0|[1-9][0-9]*)$' OR abs((target->'amount'->>'pence')::numeric)>1000000000000
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 cmd:=(command->>'commandId')::uuid;
 IF cmd IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_customer_command(cmd);
 PERFORM app.lp11_customer_variation_target((target->>'id')::uuid);
 request_hash:=app.final_lock_hash(command);
 SELECT * INTO v FROM app.variation WHERE tenant_id=t AND job_id=j AND id=(target->>'id')::uuid FOR UPDATE;
 -- Source triggers take this lock on insert; acquire it before the final session clock check.
 PERFORM app.lock_recovery_message_sources(t);
 -- Refresh after the variation lock; a concurrent approval/pricing writer may have committed during the wait.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO a FROM app.variation_approval WHERE tenant_id=t AND id=cmd;
 IF a.id IS NOT NULL THEN
  SELECT * INTO provenance FROM app.customer_variation_approval WHERE tenant_id=t AND variation_approval_id=a.id;
  IF a.job_id<>j OR provenance.customer_session_id IS DISTINCT FROM s.id OR provenance.customer_command_hash IS DISTINCT FROM request_hash
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM app.lp11_close_customer_scope();
  RETURN jsonb_build_object('version','customer-portal-approval-result.v1','approvalId',a.id,'method',a.method);
 END IF;
 IF v.id IS NULL OR v.state<>'priced' OR job.status<>'live' OR job.revision<>(command->>'expectedJobRevision')::integer
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM app.variation_revision WHERE tenant_id=t AND job_id=j AND variation_id=v.id AND id=v.current_revision_id;
 IF r.id IS NULL OR r.revision<>(target->>'revision')::integer OR r.content_hash<>(target->>'hash')
  OR r.signed_delta_pence<>(target->'amount'->>'pence')::bigint
  OR EXISTS(SELECT 1 FROM app.variation_approval WHERE tenant_id=t AND revision_id=r.id)
  OR EXISTS(SELECT 1 FROM app.variation_rejection WHERE tenant_id=t AND revision_id=r.id)
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_customer_variation_target(v.id,v.scope_item_id);
 INSERT INTO app.customer_variation_approval(tenant_id,variation_approval_id,customer_session_id,customer_command_hash)
 VALUES(t,cmd,s.id,request_hash);
 INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,evidence_id,approved_at)
 VALUES(cmd,t,j,v.id,r.id,r.revision,r.content_hash,r.signed_delta_pence,'customer_authenticated',NULL,NULL,clock_timestamp());
 INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) SELECT t,j,v.scope_item_id WHERE v.existing_scope_item_id IS NULL ON CONFLICT DO NOTHING;
 UPDATE app.variation SET state='approved' WHERE tenant_id=t AND id=v.id;
 PERFORM app.customer_portal_audit(t,cmd,'variation_approved');
 PERFORM app.lp11_close_customer_scope();
 RETURN jsonb_build_object('version','customer-portal-approval-result.v1','approvalId',cmd,'method','customer_authenticated');
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
END $$;

-- Shadow worker work is qualified by a persisted job and restricted to that
-- job. The lookup role has no shadow-table writes or runtime membership.
GRANT CREATE ON SCHEMA app,control_plane TO jobguard_session_lookup;
CREATE UNLOGGED TABLE control_plane.lp11_shadow_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 login name NOT NULL,
 practice_digest text,
 checked boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL
);
ALTER TABLE control_plane.lp11_shadow_scope OWNER TO jobguard_session_lookup;
REVOKE ALL ON TABLE control_plane.lp11_shadow_scope FROM PUBLIC;
GRANT SELECT ON app.job,app.job_commercial_track TO jobguard_session_lookup;

CREATE FUNCTION app.lp11_shadow_lookup(t uuid,j uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM control_plane.lp11_shadow_scope s
  WHERE s.transaction_id=pg_current_xact_id_if_assigned()
   AND (s.tenant_id,s.job_id,s.login)=(t,j,session_user) AND NOT s.checked)
$$;
ALTER FUNCTION app.lp11_shadow_lookup(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_shadow_lookup(uuid,uuid) FROM PUBLIC;
CREATE POLICY lp11_shadow_lookup ON app.job FOR SELECT TO jobguard_session_lookup
 USING (app.lp11_shadow_lookup(tenant_id,id));
CREATE POLICY lp11_shadow_lookup ON app.job_commercial_track FOR SELECT TO jobguard_session_lookup
 USING (app.lp11_shadow_lookup(tenant_id,job_id));

CREATE FUNCTION app.lp11_bind_shadow_job(t uuid,j uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior control_plane.lp11_shadow_scope; owner_digest text; bound_tenant uuid:=app.lp11_policy_tenant();
BEGIN
 IF t IS NULL OR j IS NULL OR current_database()<>'jobguard_synthetic_demo'
  OR NOT (pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_shadow_emergency_access','USAGE'))
  OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF bound_tenant IS NOT NULL AND t IS DISTINCT FROM bound_tenant THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prior FROM control_plane.lp11_shadow_scope s WHERE s.transaction_id=pg_current_xact_id_if_assigned();
 IF FOUND THEN
  IF (prior.tenant_id,prior.job_id,prior.login) IS DISTINCT FROM (t,j,session_user)
   OR NOT prior.checked OR prior.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN;
 END IF;
 DELETE FROM control_plane.lp11_shadow_scope WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.lp11_shadow_scope(transaction_id,tenant_id,job_id,login,expires_at)
 VALUES(pg_current_xact_id(),t,j,session_user,clock_timestamp()+interval '5 minutes');
 SELECT x.practice_session_digest INTO owner_digest
 FROM app.job x JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(x.tenant_id,x.id)
 WHERE (x.tenant_id,x.id)=(t,j) AND tr.job_track='small_builder' AND tr.environment='synthetic_demo'
  AND x.status IN('live','invoiced','paid');
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 UPDATE control_plane.lp11_shadow_scope s SET checked=true,practice_digest=owner_digest
 WHERE s.transaction_id=pg_current_xact_id_if_assigned();
END $$;
ALTER FUNCTION app.lp11_bind_shadow_job(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_bind_shadow_job(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_bind_shadow_job(uuid,uuid) TO jobguard_shadow,jobguard_migration;

CREATE FUNCTION app.lp11_shadow_job_tenant(j uuid,d text,section text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_shadow_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned()
  AND s.login=session_user AND s.checked AND s.expires_at>clock_timestamp()
  AND CASE section WHEN 'job' THEN s.job_id=j
    WHEN 'terms' THEN d IS NULL OR s.practice_digest=d
    WHEN 'audit' THEN j IS NULL OR s.job_id=j
    ELSE false END
$$;
ALTER FUNCTION app.lp11_shadow_job_tenant(uuid,text,text) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_shadow_job_tenant(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_shadow_job_tenant(uuid,text,text) TO jobguard_shadow,jobguard_migration,jobguard_runtime,jobguard_audit_writer;
REVOKE CREATE ON SCHEMA app,control_plane FROM jobguard_session_lookup;

-- Shadow support and disclosure bind the exact stored synthetic job before reading.
CREATE OR REPLACE FUNCTION app.record_shadow_disclosure(p_tenant uuid,p_job uuid,p_signal uuid,p_event uuid,p_route text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE locked boolean:=false;prior app.shadow_disclosure_event;visible_at timestamptz;survivor uuid;members uuid[]; previous_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_event IS NULL OR p_signal IS NULL OR p_job IS NULL OR p_route IS NULL OR p_route NOT IN ('must_surface_override','support_conversation','export','data_subject_access','defect','tell_me_now','trial_job_live','paid_human_review','drawing_review','upgrade_bridge') THEN RAISE EXCEPTION 'invalid disclosure' USING ERRCODE='22023'; END IF;
 IF p_route='support_conversation' AND NOT pg_has_role(session_user,'jobguard_shadow_emergency_access','USAGE') THEN
  RAISE EXCEPTION 'separate support permission required' USING ERRCODE='42501';
 END IF;
 PERFORM app.lp11_bind_shadow_job(p_tenant,p_job);
 -- Same key as the detection repository: coalescing only ever happens under it, so a disclosure
 -- is wholly before or wholly after any coalescing transaction for this job.
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||p_tenant::text||':'||p_job::text,0));
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO prior FROM app.shadow_disclosure_event WHERE tenant_id=p_tenant AND id=p_event;
 IF FOUND THEN
  IF ROW(prior.job_id,prior.signal_id,prior.route,prior.actor_ref) IS DISTINCT FROM ROW(p_job,p_signal,p_route,'role:'||session_user) THEN RAISE EXCEPTION 'disclosure replay conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.id;
 END IF;
 SELECT coalesce(coalesced_into_signal_id,id) INTO survivor FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT array_agg(g.id ORDER BY g.id) INTO members FROM (
  SELECT id FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND (id=survivor OR coalesced_into_signal_id=survivor) ORDER BY id FOR UPDATE) g;
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job; END IF;
 INSERT INTO app.shadow_disclosure_event(tenant_id,job_id,id,signal_id,route,actor_ref,before_lock)
 VALUES(p_tenant,p_job,p_event,p_signal,p_route,'role:'||session_user,NOT locked) RETURNING created_at INTO visible_at;
 IF NOT locked THEN
  UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true,first_builder_visible_at=coalesce(first_builder_visible_at,visible_at),state='surfaced_early',revision=revision+1
   WHERE tenant_id=p_tenant AND job_id=p_job AND id=ANY(members);
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT p_tenant,p_job,gen_random_uuid(),m,r,p_event::text FROM unnest(members) m CROSS JOIN (VALUES('disclosed_before_lock'),('surfaced_early')) x(r)
  ON CONFLICT DO NOTHING;
 ELSE
  UPDATE app.shadow_commercial_signal SET first_builder_visible_at=coalesce(first_builder_visible_at,visible_at) WHERE tenant_id=p_tenant AND job_id=p_job AND id=ANY(members);
 END IF;
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 PERFORM app.append_shadow_audit(p_event,p_job,'shadow.disclosed');
 PERFORM set_config('app.tenant_id',coalesce(previous_tenant,''),true);
 RETURN p_event;
END $$;

CREATE OR REPLACE FUNCTION app.read_shadow_emergency(p_tenant uuid,p_job uuid,p_reason text) RETURNS SETOF app.shadow_commercial_signal
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE event_id uuid:=gen_random_uuid(); previous_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))=0 OR length(p_reason)>1000 THEN RAISE EXCEPTION 'emergency access reason required' USING ERRCODE='22023'; END IF;
 -- The separate emergency role is enforced by this routine's exact EXECUTE grant.
 PERFORM app.lp11_bind_shadow_job(p_tenant,p_job);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 INSERT INTO app.shadow_break_glass_access(tenant_id,job_id,id,actor_ref,reason) VALUES(p_tenant,p_job,event_id,'role:'||session_user,btrim(p_reason));
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 PERFORM app.append_shadow_audit(event_id,p_job,'shadow.emergency_read',encode(sha256(convert_to(btrim(p_reason),'UTF8')),'hex'));
 PERFORM set_config('app.tenant_id',coalesce(previous_tenant,''),true);
 RETURN QUERY SELECT * FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job;
END $$;

CREATE OR REPLACE FUNCTION app.final_check_worker(t uuid, j uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
 PERFORM app.final_check_context(t);
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.lp11_bind_shadow_job(t,j);
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 OR NOT app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Acquire prerequisite job/advisory locks before shadow locks and any audit allocation.
 PERFORM app.final_check_require_worker(t,j);
END $$;

CREATE OR REPLACE FUNCTION app.final_check_cycle_finish(t uuid,j uuid,l uuid,m uuid,a integer,c uuid,succeeded boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM infrastructure.final_check_request WHERE (tenant_id,job_id,lock_id,manifest_id,attempt,cycle_id)=(t,j,l,m,a,c) AND cycle_state='active') THEN RETURN; END IF;
 PERFORM app.lp11_bind_shadow_job(t,j);
 -- A lost publication response reconciles only the exact current checked fact.
 BEGIN
  IF EXISTS(SELECT 1 FROM app.require_authoritative_final_check(t,j) proof
   JOIN app.shadow_final_check_completion cert ON(cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(t,j,proof.check_id,proof.run_id,proof.lock_id)
   JOIN app.final_check_run_binding binding ON(binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(t,j,cert.run_id,cert.lock_id,cert.manifest_id)
   WHERE (cert.lock_id,cert.manifest_id)=(l,m)) THEN succeeded:=true;
  ELSIF succeeded THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 EXCEPTION WHEN raise_exception THEN
  IF succeeded THEN RAISE; END IF;
 END;
 UPDATE infrastructure.final_check_request SET cycle_state=CASE WHEN succeeded THEN 'completed' WHEN executions>=3 THEN 'failed' ELSE 'active' END
 WHERE (tenant_id,job_id,lock_id,manifest_id,attempt,cycle_id)=(t,j,l,m,a,c) AND cycle_state='active';
END $$;

CREATE OR REPLACE FUNCTION identity.oidc_save(c uuid,r jsonb,config jsonb,s uuid,u uuid,d char(64),csrf text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE meta jsonb; t uuid; BEGIN
 t:=identity.lp11_open_sso_scope(c,'cache');
 meta:=identity.sso_load_connection(c);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF meta IS DISTINCT FROM config OR meta->>'protocol' IS DISTINCT FROM 'oidc' OR r->>'version' IS DISTINCT FROM 'oidc-request.v1'
 OR r->>'tenantId' IS DISTINCT FROM t::text OR r->>'connectionId' IS DISTINCT FROM c::text
 OR r->>'issuer' IS DISTINCT FROM meta->'config'->>'issuer' OR r->>'clientId' IS DISTINCT FROM meta->'config'->>'clientId' OR r->>'redirectUri' IS DISTINCT FROM meta->'config'->>'redirectUri'
 OR (r->>'nonce' ~ '^[A-Za-z0-9_-]{43}$') IS NOT TRUE OR (r->>'verifier' ~ '^[A-Za-z0-9_-]{43}$') IS NOT TRUE OR (r->>'browserBinding' ~ '^[A-Za-z0-9_-]{43}$') IS NOT TRUE
 THEN RAISE EXCEPTION 'REQUEST_REFUSED'; END IF;
 PERFORM identity.oidc_link(t,s,u,d,csrf);
 INSERT INTO identity.oidc_request(tenant_id,connection_id,state,request,configuration,link_session_id,link_user_id,link_digest,link_csrf) VALUES(t,c,r->>'state',r,meta,s,u,d,csrf);
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;

CREATE OR REPLACE FUNCTION identity.oidc_claim(c uuid,state_value text,browser text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE meta jsonb; t uuid; r identity.oidc_request; BEGIN
 t:=identity.lp11_open_sso_scope(c,'cache');
 meta:=identity.sso_load_connection(c);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 UPDATE identity.oidc_request SET status='claimed',claimed_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND state=state_value
 AND status='pending' AND expires_at>clock_timestamp() AND request->>'browserBinding'=browser AND configuration=meta RETURNING * INTO r;
 IF r.state IS NULL THEN RAISE EXCEPTION 'REQUEST_REFUSED'; END IF;
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN jsonb_build_object('connection',r.configuration,'request',r.request,'linkSessionId',r.link_session_id);
END $$;

CREATE OR REPLACE FUNCTION identity.oidc_fail(c uuid,state_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; BEGIN
 t:=identity.lp11_open_sso_scope(c,'cache');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 UPDATE identity.oidc_request SET status='outcome_unknown',finished_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND state=state_value AND status='claimed';
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;

CREATE OR REPLACE FUNCTION identity.oidc_complete(c uuid,state_value text,claims jsonb,new_session uuid,token char(64),csrf text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; meta jsonb; r identity.oidc_request; result jsonb; sh text; eh text; assertion text; BEGIN
 t:=identity.lp11_open_sso_scope(c,'cache');
 meta:=identity.sso_load_connection(c);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO r FROM identity.oidc_request WHERE tenant_id=t AND connection_id=c AND state=state_value FOR UPDATE;
 IF r.state IS NULL OR r.status<>'claimed' OR r.expires_at<=clock_timestamp() OR r.configuration IS DISTINCT FROM meta
 OR claims->>'version' IS DISTINCT FROM 'oidc-claims.v1' OR claims->>'tenantId' IS DISTINCT FROM t::text OR claims->>'connectionId' IS DISTINCT FROM c::text
 OR claims->>'issuer' IS DISTINCT FROM meta->'config'->>'issuer' OR claims->'emailVerified' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'REQUEST_REFUSED'; END IF;
 PERFORM identity.oidc_link(t,r.link_session_id,r.link_user_id,r.link_digest,r.link_csrf);
 -- Existing SCIM subject hash contract; the composite subject key includes the immutable protocol/issuer connection.
 sh:=encode(sha256(convert_to(claims->>'subject','UTF8')),'hex');
 eh:=encode(sha256(convert_to(lower(claims->>'email'),'UTF8')),'hex');
 assertion:='oidc_'||replace(c::text,'-','_')||'_'||state_value;
 -- Only the claimed durable request can introduce a bridge request to existing identity authority.
 INSERT INTO identity.sso_request(tenant_id,connection_id,request_id,request_value,state_digest,link_session_id,expires_at,consumed_at)
 VALUES(t,c,assertion,'oidc',eh,r.link_session_id,r.expires_at,clock_timestamp());
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 result:=identity.sso_complete(c,jsonb_build_object('assertionId',assertion,'requestId',assertion,'subjectHash',sh,'emailHash',eh,'email',lower(claims->>'email'),'groups',claims->'groups'),eh,new_session,token,csrf,date_trunc('milliseconds',clock_timestamp())+(meta->>'sessionLimitSeconds')::integer*interval '1 second');
 PERFORM identity.lp11_open_sso_scope(c,'cache');
 UPDATE identity.oidc_request SET status=CASE WHEN result ? 'code' THEN 'refused' ELSE 'completed' END,finished_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND state=state_value;
 DELETE FROM control_plane.lp11_sso_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN result;
END $$;

-- The shadow worker can transfer an exact job to its ordinary RLS reader
-- without transferring the worker role. Permits are opaque and single-use.
GRANT CREATE ON SCHEMA app,control_plane TO jobguard_session_lookup;
CREATE UNLOGGED TABLE control_plane.lp11_observation_permit (
 digest bytea PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 practice_digest text,
 expires_at timestamptz NOT NULL
);
CREATE UNLOGGED TABLE control_plane.lp11_observation_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 practice_digest text,
 reader name NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE control_plane.lp11_observation_permit OWNER TO jobguard_session_lookup;
ALTER TABLE control_plane.lp11_observation_scope OWNER TO jobguard_session_lookup;
REVOKE ALL ON control_plane.lp11_observation_permit,control_plane.lp11_observation_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_shadow_job_has_terms(t uuid,j uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM app.lp11_bind_shadow_job(t,j);
 RETURN app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1');
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM IS DISTINCT FROM 'FINAL_CHECK_FORBIDDEN' THEN RAISE; END IF;
 RETURN false;
END $$;
ALTER FUNCTION app.lp11_shadow_job_has_terms(uuid,uuid) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_shadow_job_has_terms(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_shadow_job_has_terms(uuid,uuid) TO jobguard_shadow;

CREATE FUNCTION app.lp11_issue_observation_permit(t uuid,j uuid,credential text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF credential IS NULL OR credential !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'OBSERVATION_JOB_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 IF NOT app.lp11_shadow_job_has_terms(t,j) THEN
  RAISE EXCEPTION 'OBSERVATION_JOB_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 DELETE FROM control_plane.lp11_observation_permit WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.lp11_observation_permit
 SELECT sha256(convert_to(credential,'UTF8')),s.tenant_id,s.job_id,s.practice_digest,clock_timestamp()+interval '1 minute'
 FROM control_plane.lp11_shadow_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.checked AND (s.tenant_id,s.job_id)=(t,j);
END $$;
ALTER FUNCTION app.lp11_issue_observation_permit(uuid,uuid,text) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_issue_observation_permit(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_issue_observation_permit(uuid,uuid,text) TO jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.final_check_job_terms(uuid,uuid,text,timestamptz) TO jobguard_session_lookup;

CREATE FUNCTION app.lp11_bind_observation_read(t uuid,j uuid,credential text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p control_plane.lp11_observation_permit; bound_tenant uuid:=app.lp11_policy_tenant();
BEGIN
 IF credential IS NULL OR credential !~ '^[a-f0-9]{64}$'
  OR NOT pg_has_role(session_user,'jobguard_runtime','USAGE')
  OR pg_has_role(session_user,'jobguard_shadow','USAGE') THEN
  RAISE EXCEPTION 'OBSERVATION_JOB_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 DELETE FROM control_plane.lp11_observation_permit x
 WHERE x.digest=sha256(convert_to(credential,'UTF8')) AND (x.tenant_id,x.job_id)=(t,j)
  AND x.expires_at>clock_timestamp()
 RETURNING x.* INTO p;
 IF NOT FOUND THEN RAISE EXCEPTION 'OBSERVATION_JOB_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF bound_tenant IS NOT NULL THEN
  IF bound_tenant IS DISTINCT FROM p.tenant_id THEN
   RAISE EXCEPTION 'OBSERVATION_JOB_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  RETURN;
 END IF;
 DELETE FROM control_plane.lp11_observation_scope WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.lp11_observation_scope VALUES
  (pg_current_xact_id(),p.tenant_id,p.job_id,p.practice_digest,session_user,p.expires_at);
END $$;
ALTER FUNCTION app.lp11_bind_observation_read(uuid,uuid,text) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_bind_observation_read(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_bind_observation_read(uuid,uuid,text) TO jobguard_runtime;

CREATE FUNCTION app.lp11_observation_tenant(j uuid,d text,terms boolean DEFAULT false) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_observation_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.reader=session_user
  AND s.expires_at>clock_timestamp()
  AND coalesce(app.lp11_policy_tenant(),s.tenant_id)=s.tenant_id
  AND CASE WHEN terms THEN s.practice_digest IS NOT DISTINCT FROM d ELSE s.job_id=j END
$$;
ALTER FUNCTION app.lp11_observation_tenant(uuid,text,boolean) OWNER TO jobguard_session_lookup;
REVOKE ALL ON FUNCTION app.lp11_observation_tenant(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_observation_tenant(uuid,text,boolean) TO jobguard_runtime,jobguard_migration;
REVOKE CREATE ON SCHEMA app,control_plane FROM jobguard_session_lookup;

DO $observation$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY[
  'job_commercial_track','final_account_lock','evidence_object','evidence_upload','job_record_proposal',
  'supplier_document','supplier_document_version','supplier_fact_proposal','purchase_order_revision','purchase_order_draft',
  'material_requirement','job_source_original',
  'job_diary_entry','customer_message_source','quote_document_version','quote_line','variation','variation_withdrawal'
 ] LOOP
  EXECUTE format('CREATE POLICY lp11_observation_reader ON app.%I FOR SELECT TO jobguard_runtime,jobguard_migration
   USING (tenant_id=app.lp11_observation_tenant(job_id,NULL))',relation);
 END LOOP;
END $observation$;
CREATE POLICY lp11_observation_reader ON app.job FOR SELECT TO jobguard_runtime,jobguard_migration
 USING (tenant_id=app.lp11_observation_tenant(id,NULL));
CREATE POLICY lp11_observation_reader ON app.final_check_terms_acceptance FOR SELECT TO jobguard_runtime,jobguard_migration
 USING (tenant_id=app.lp11_observation_tenant(NULL,practice_session_digest,true));
CREATE POLICY lp11_observation_reader ON app.capture_source FOR SELECT TO jobguard_runtime,jobguard_migration
 USING (EXISTS(SELECT 1 FROM app.job_record_proposal p
  WHERE (p.tenant_id,p.source_id)=(capture_source.tenant_id,capture_source.id)
   AND p.tenant_id=app.lp11_observation_tenant(p.job_id,NULL)));
CREATE POLICY lp11_observation_reader ON app.evidence_invalidation FOR SELECT TO jobguard_runtime,jobguard_migration
 USING (EXISTS(SELECT 1 FROM app.evidence_object e
  WHERE (e.tenant_id,e.id)=(evidence_invalidation.tenant_id,evidence_invalidation.evidence_id)
   AND e.tenant_id=app.lp11_observation_tenant(e.job_id,NULL)));

CREATE FUNCTION app.lp11_shadow_decision_tenant(signal text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM app.shadow_commercial_signal s
 WHERE s.id=CASE WHEN pg_input_is_valid(signal,'uuid') THEN signal::uuid END
  AND s.tenant_id=app.lp11_shadow_job_tenant(s.job_id,NULL,'job')
$$;
ALTER FUNCTION app.lp11_shadow_decision_tenant(text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_shadow_decision_tenant(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.serialize_final_check_invalidation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE source_job uuid;unbound_maintenance boolean:=app.lp6d_maintenance_login() AND NOT app.lp6e_request_binding_present();
BEGIN
 -- Preserve the existing privileged maintenance/fixture write path, as for evidence registration.
 -- Ordinary sessions still require their own tenant context before any lookup or lock.
 IF unbound_maintenance THEN
  INSERT INTO control_plane.lp11_maintenance_job(transaction_id,tenant_id,source_evidence_id)
   VALUES(pg_current_xact_id(),NEW.tenant_id,NEW.evidence_id);
 ELSIF NEW.tenant_id IS DISTINCT FROM app.lp11_policy_tenant() THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT job_id INTO source_job FROM app.evidence_object WHERE tenant_id=NEW.tenant_id AND id=NEW.evidence_id;
 IF unbound_maintenance THEN
  UPDATE control_plane.lp11_maintenance_job SET job_id=source_job
   WHERE transaction_id=pg_current_xact_id_if_assigned();
 END IF;
 -- SHARE is compatible with the watchdog live guard other commands already hold, so merged invalidation/completion races still
 -- reach their own upload-row lock; it still excludes the UPDATE-class lock/freeze/publication/invoice routines until commit.
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=source_job FOR SHARE;
 -- The next BEFORE trigger reads the same exact scope and then closes it.
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.refuse_final_check_locked_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- Match the serializer's privileged maintenance path without trusting an arbitrary tenant.
 IF NEW.tenant_id IS DISTINCT FROM coalesce(app.lp11_policy_tenant(),app.lp11_maintenance_evidence_tenant(NEW.evidence_id)) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Use verify_final_check_run's non-excluded, original-object source binding,
 -- including sources finalized after the manifest froze a null evidence identity.
 IF EXISTS(
  SELECT 1 FROM app.final_account_lock l
  JOIN app.final_check_manifest m
   ON (m.tenant_id,m.job_id,m.lock_id,m.evidence_cutoff_at)=(l.tenant_id,l.job_id,l.id,l.locked_at)
  JOIN app.final_check_manifest_source s
   ON (s.tenant_id,s.job_id,s.manifest_id)=(m.tenant_id,m.job_id,m.id)
  JOIN app.evidence_upload u
   ON (u.tenant_id,u.job_id,u.id,u.server_received_at)=(s.tenant_id,s.job_id,s.upload_id,s.source_received_at)
  JOIN app.evidence_object e
   ON (e.tenant_id,e.job_id,e.upload_id)=(u.tenant_id,u.job_id,u.id)
  WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.evidence_id
   AND s.excluded_state IS NULL AND u.state='verified' AND e.kind='original'
   AND e.sha256=u.expected_sha256 AND e.object_version_id=u.object_version_id
   AND e.server_received_at<=m.evidence_cutoff_at
   AND (s.evidence_id IS NULL OR
    (e.id,e.object_version_id,e.sha256,e.server_received_at)=
    (s.evidence_id,s.object_version_id,s.sha256,s.evidence_received_at))
   -- Only until the final invoice is issued (the issue functions' own final-invoice rule).
   -- After that, a withdrawal no longer strands final invoice issue, and C135 recovery
   -- flows (evidence packs, pursuit, allocations) depend on post-lock withdrawal.
   AND NOT EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b
    ON (b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id)
    WHERE i.tenant_id=l.tenant_id AND i.job_id=l.job_id AND coalesce(b.invoice_kind,'final')='final')
 ) THEN
  RAISE EXCEPTION 'FINAL_CHECK_VERIFIED_SOURCE_LOCKED' USING ERRCODE='55000';
 END IF;
 DELETE FROM control_plane.lp11_maintenance_job
 WHERE transaction_id=pg_current_xact_id_if_assigned() AND source_evidence_id=NEW.evidence_id;
 RETURN NEW;
END $$;

CREATE FUNCTION app.lp11_shadow_evidence_tenant(evidence uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT e.tenant_id FROM app.evidence_object e
 WHERE e.id=evidence AND e.tenant_id=app.lp11_shadow_job_tenant(e.job_id,NULL,'job')
$$;
ALTER FUNCTION app.lp11_shadow_evidence_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_shadow_evidence_tenant(uuid) FROM PUBLIC;


-- Linked practice preserves the existing parent-first lock order. The
-- checked parent and its effective owner qualify only one membership lock.
CREATE UNLOGGED TABLE control_plane.lp11_linked_parent_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 membership_id uuid NOT NULL
);
ALTER TABLE control_plane.lp11_linked_parent_scope OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_linked_parent_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_linked_parent_tenant(m uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_linked_parent_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.membership_id=m
$$;
ALTER FUNCTION app.lp11_linked_parent_tenant(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_linked_parent_tenant(uuid) FROM PUBLIC;
CREATE POLICY lp11_linked_parent_read ON app.membership FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_linked_parent_tenant(id));
-- PostgreSQL checks UPDATE policy visibility for SELECT FOR SHARE.
CREATE POLICY lp11_linked_parent_lock ON app.membership FOR UPDATE TO jobguard_migration
 USING (tenant_id=app.lp11_linked_parent_tenant(id)) WITH CHECK (false);
CREATE POLICY lp11_linked_parent_read ON app.contractor_membership_revocation FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_linked_parent_tenant(membership_id));

CREATE OR REPLACE FUNCTION app.linked_practice_parent(d text)
 RETURNS TABLE(parent_id uuid,identity_tenant uuid,owner_membership uuid,deadline timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s identity.session; m record; scope jsonb; n integer; t uuid; member uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR d IS NULL OR d !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT * INTO s FROM identity.session WHERE token_digest=d;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 scope:=identity.sso_session_scope(s.id);
 SELECT count(*),(array_agg(e.tenant_id))[1],(array_agg(e.id))[1] INTO n,t,member
 FROM identity.sso_session_memberships(s.user_id,s.id) e
 WHERE scope IS NULL OR (coalesce((scope->>'revoked')::boolean,false)=false
  AND e.tenant_id::text=scope->>'tenantId' AND e.id::text=scope->>'membershipId');
 IF n<>1 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM 1 FROM identity.session WHERE id=s.id FOR SHARE;
 INSERT INTO control_plane.lp11_linked_parent_scope(transaction_id,tenant_id,membership_id)
 VALUES(pg_current_xact_id(),t,member);
 PERFORM 1 FROM identity.membership_locator WHERE user_id=s.user_id AND tenant_id=t FOR SHARE;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=member FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 -- Fresh reads after ALL waits; scope/effective membership are not replaced by
 -- the row lock. This also rejects contractor revocation and SSO restrictions.
 SELECT * INTO s FROM identity.session WHERE id=s.id;
 scope:=identity.sso_session_scope(s.id);
 SELECT count(*) INTO n FROM identity.sso_session_memberships(s.user_id,s.id) e
 WHERE scope IS NULL OR (coalesce((scope->>'revoked')::boolean,false)=false
  AND e.tenant_id::text=scope->>'tenantId' AND e.id::text=scope->>'membershipId');
 SELECT * INTO m FROM identity.sso_session_memberships(s.user_id,s.id) e WHERE e.id=member AND e.tenant_id=t;
 IF s.environment<>'synthetic_demo' OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp()
  OR n<>1 OR m.id IS NULL OR m.role<>'owner' OR NOT EXISTS(
   SELECT 1 FROM app.membership a WHERE (a.tenant_id,a.id,a.identity_user_id)=(t,member,s.user_id)
    AND a.role='owner' AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(t,member)))
 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT least(s.expires_at,coalesce(a.expires_at,'infinity')) INTO deadline
 FROM app.membership a WHERE (a.tenant_id,a.id)=(t,member);
 parent_id:=s.id; identity_tenant:=t; owner_membership:=member;
 DELETE FROM control_plane.lp11_linked_parent_scope
 WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN NEXT;
END $$;

-- Stage events and their audit witness only after authenticating the stored
-- connector binding. Other namespaces of the same tenant are inaccessible.
CREATE UNLOGGED TABLE control_plane.lp11_connector_input_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 binding_id uuid NOT NULL,
 namespace text NOT NULL,
 login name NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE control_plane.lp11_connector_input_scope OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_connector_input_scope FROM PUBLIC;

CREATE FUNCTION connector.lp11_input_tenant(ns text, binding uuid DEFAULT NULL) RETURNS uuid
 LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_connector_input_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND s.expires_at>clock_timestamp() AND s.namespace=ns
  AND (binding IS NULL OR s.binding_id=binding)
  AND coalesce(app.lp11_policy_tenant(),s.tenant_id)=s.tenant_id
$$;
ALTER FUNCTION connector.lp11_input_tenant(text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION connector.lp11_input_tenant(text,uuid) FROM PUBLIC;

CREATE FUNCTION app.lp11_connector_audit_tenant(subject text, actor text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_connector_input_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND s.expires_at>clock_timestamp() AND s.binding_id::text=subject
  AND actor='connector:'||s.binding_id::text
  AND coalesce(app.lp11_policy_tenant(),s.tenant_id)=s.tenant_id
$$;
ALTER FUNCTION app.lp11_connector_audit_tenant(text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_connector_audit_tenant(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_connector_audit_tenant(text,text) TO jobguard_audit_writer;

CREATE OR REPLACE FUNCTION connector.intake(binding_id uuid, token text, input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b connector.binding; prior connector.input_event; h text; result jsonb;
 payload jsonb; v_kind text;
 previous_context text:=current_setting('app.tenant_id',true);
BEGIN
 -- No caller-supplied tenant, human membership, role, mode, job, bill or target SQL routine.
 SELECT * INTO b FROM connector.binding WHERE id=binding_id FOR SHARE;
 IF NOT FOUND OR token IS NULL OR octet_length(token) NOT BETWEEN 32 AND 256
  OR b.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
  OR b.revoked_at IS NOT NULL OR b.expires_at<=clock_timestamp()
  OR b.environment<>'synthetic_demo' OR b.endpoint_kind<>'fake'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM connector.machine_connection m WHERE m.id=binding_id)
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 IF app.lp11_policy_tenant() IS NOT NULL AND app.lp11_policy_tenant() IS DISTINCT FROM b.tenant_id THEN
  RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501';
 END IF;
 INSERT INTO control_plane.lp11_connector_input_scope(transaction_id,tenant_id,binding_id,namespace,login,expires_at)
 VALUES(pg_current_xact_id(),b.tenant_id,b.id,b.namespace,session_user,b.expires_at);
 -- Validate again at the database boundary, including direct SQL attacks.
 IF input IS NULL OR jsonb_typeof(input)<>'object' OR octet_length(input::text)>16384
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 v_kind:=input->>'kind';
 IF v_kind IS NULL OR v_kind NOT IN('work_order','billing_status','materials_issue','export_delivery')
  OR input->>'version' IS DISTINCT FROM 'connector-input.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>6
  OR NOT(input ?& ARRAY['version','eventId','subject','revision','kind'])
  OR input - ARRAY['version','eventId','subject','revision','kind','document','status','outcome']<>'{}'::jsonb
  OR jsonb_typeof(input->'eventId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'subject') IS DISTINCT FROM 'string'
  OR input->>'eventId' !~ '^fixture:[a-z0-9_-]{1,112}$'
  OR input->>'subject' !~ '^fixture:[a-z0-9_-]{1,112}$'
  OR jsonb_typeof(input->'revision') IS DISTINCT FROM 'number'
  OR (input->>'revision') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 IF (input->>'revision')::bigint>2147483647
  OR (v_kind IN('work_order','materials_issue') AND (NOT input ? 'document' OR input ? 'status'
   OR jsonb_typeof(input->'document') IS DISTINCT FROM 'string' OR input->>'document' !~ '^fixture:[a-z0-9_-]{1,112}$'))
  OR (v_kind='export_delivery' AND (NOT input ? 'outcome' OR input ? 'document' OR input ? 'status'
   OR jsonb_typeof(input->'outcome') IS DISTINCT FROM 'string' OR input->>'outcome' NOT IN('received','rejected')))
  OR (v_kind='billing_status' AND (NOT input ? 'status' OR input ? 'document'
   OR jsonb_typeof(input->'status') IS DISTINCT FROM 'string' OR input->>'status' NOT IN('billed','paid','reversed')))
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 h:=app.final_lock_hash(input);
 -- Stable namespace survives key/connection/channel rotation. Serialize that whole source;
 -- no domain table is locked or touched. Reordered revisions remain immutable staged facts.
 PERFORM pg_advisory_xact_lock(hashtextextended('connector:'||b.tenant_id::text||':'||b.namespace,0));
 IF b.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM connector.input_event e WHERE e.tenant_id=b.tenant_id AND e.namespace=b.namespace AND e.event_id=input->>'eventId';
 IF FOUND THEN
  IF prior.semantic_hash<>h THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
  DELETE FROM control_plane.lp11_connector_input_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN prior.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM connector.input_event e WHERE e.tenant_id=b.tenant_id AND e.namespace=b.namespace AND e.kind=v_kind AND e.subject=input->>'subject' AND e.revision=(input->>'revision')::integer)
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
 result:=jsonb_build_object('version','connector-receipt.v1','eventId',input->>'eventId','state','staged','domainEffects',0);
 INSERT INTO connector.input_event(tenant_id,binding_id,namespace,event_id,kind,subject,revision,payload,semantic_hash,receipt)
 VALUES(b.tenant_id,b.id,b.namespace,input->>'eventId',v_kind,input->>'subject',(input->>'revision')::integer,input,h,result);
 -- Append to the existing per-tenant chain, identifiers/hash only. Audit head is the LAST lock.
 payload:=jsonb_build_object('references',jsonb_build_object('bindingId',b.id,'sourceEvent',input->>'eventId'),'hashes',jsonb_build_object('input',h));
 PERFORM set_config('app.tenant_id',b.tenant_id::text,true);
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'version','audit.v1','actorRef','connector:'||b.id::text,
  'eventType','connector.input_staged','subjectType','connector','subjectRef',b.id::text,
  'payload',payload)),'checked_operation');
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
  DELETE FROM control_plane.lp11_connector_input_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION connector.machine_stage(c uuid,token text,expected jsonb,key_ref text,nonce text,stamp bigint,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; result jsonb;
BEGIN
 authority:=connector.machine_authority(c,token);
 IF expected IS DISTINCT FROM authority OR key_ref IS NULL OR key_ref=''
  OR NOT(authority->'keyRefs' ? key_ref)
  OR input->>'kind' IS NULL OR input->>'kind'=''
  OR NOT(authority->'capabilities' ? (input->>'kind'))
  OR nonce IS NULL OR nonce !~ '^[a-zA-Z0-9_-]{16,120}$' OR stamp IS NULL
  OR abs(floor(extract(epoch FROM clock_timestamp()))-stamp)>300
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 -- Serialize all accepted nonces on this connection. Recheck expiry after any wait.
 PERFORM pg_advisory_xact_lock(hashtextextended('machine-nonce:'||c::text,0));
 IF authority IS DISTINCT FROM connector.machine_authority(c,token)
  OR abs(floor(extract(epoch FROM clock_timestamp()))-stamp)>300
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM connector.machine_nonce n WHERE n.connection_id=c AND n.nonce=machine_stage.nonce AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
 INSERT INTO connector.machine_nonce VALUES((authority->>'tenantId')::uuid,c,nonce,clock_timestamp()+interval '10 minutes')
 ON CONFLICT ON CONSTRAINT machine_nonce_pkey DO UPDATE SET expires_at=excluded.expires_at;
 -- Inline the latest 0576 intake body after machine authorization. No public bypass.
 <<verified_input>>
 DECLARE b connector.binding; prior connector.input_event; h text; result jsonb;
 payload jsonb; v_kind text;
 previous_context text:=current_setting('app.tenant_id',true);
BEGIN
 -- No caller-supplied tenant, human membership, role, mode, job, bill or target SQL routine.
 SELECT * INTO b FROM connector.binding WHERE id=c FOR SHARE;
 IF NOT FOUND OR token IS NULL OR octet_length(token) NOT BETWEEN 32 AND 256
  OR b.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
  OR b.revoked_at IS NOT NULL OR b.expires_at<=clock_timestamp()
  OR b.environment<>'synthetic_demo' OR b.endpoint_kind<>'fake'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 IF app.lp11_policy_tenant() IS NOT NULL AND app.lp11_policy_tenant() IS DISTINCT FROM b.tenant_id THEN
  RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501';
 END IF;
 INSERT INTO control_plane.lp11_connector_input_scope(transaction_id,tenant_id,binding_id,namespace,login,expires_at)
 VALUES(pg_current_xact_id(),b.tenant_id,b.id,b.namespace,session_user,b.expires_at);
 -- Validate again at the database boundary, including direct SQL attacks.
 IF input IS NULL OR jsonb_typeof(input)<>'object' OR octet_length(input::text)>16384
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 v_kind:=input->>'kind';
 IF v_kind IS NULL OR v_kind NOT IN('work_order','billing_status','materials_issue')
  OR input->>'version' IS DISTINCT FROM 'connector-input.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>6
  OR NOT(input ?& ARRAY['version','eventId','subject','revision','kind'])
  OR input - ARRAY['version','eventId','subject','revision','kind','document','status']<>'{}'::jsonb
  OR jsonb_typeof(input->'eventId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'subject') IS DISTINCT FROM 'string'
  OR input->>'eventId' !~ '^fixture:[a-z0-9_-]{1,112}$'
  OR input->>'subject' !~ '^fixture:[a-z0-9_-]{1,112}$'
  OR jsonb_typeof(input->'revision') IS DISTINCT FROM 'number'
  OR (input->>'revision') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 IF (input->>'revision')::bigint>2147483647
  OR (v_kind IN('work_order','materials_issue') AND (NOT input ? 'document' OR input ? 'status'
   OR jsonb_typeof(input->'document') IS DISTINCT FROM 'string' OR input->>'document' !~ '^fixture:[a-z0-9_-]{1,112}$'))
  OR (v_kind='billing_status' AND (NOT input ? 'status' OR input ? 'document'
   OR jsonb_typeof(input->'status') IS DISTINCT FROM 'string' OR input->>'status' NOT IN('billed','paid','reversed')))
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 h:=app.final_lock_hash(input);
 -- Stable namespace survives key/connection/channel rotation. Serialize that whole source;
 -- no domain table is locked or touched. Reordered revisions remain immutable staged facts.
 PERFORM pg_advisory_xact_lock(hashtextextended('connector:'||b.tenant_id::text||':'||b.namespace,0));
 IF b.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM connector.input_event e WHERE e.tenant_id=b.tenant_id AND e.namespace=b.namespace AND e.event_id=input->>'eventId';
 IF FOUND THEN
  IF prior.semantic_hash<>h THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
  DELETE FROM control_plane.lp11_connector_input_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  RETURN prior.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM connector.input_event e WHERE e.tenant_id=b.tenant_id AND e.namespace=b.namespace AND e.kind=v_kind AND e.subject=input->>'subject' AND e.revision=(input->>'revision')::integer)
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
 result:=jsonb_build_object('version','connector-receipt.v1','eventId',input->>'eventId','state','staged','domainEffects',0);
 INSERT INTO connector.input_event(tenant_id,binding_id,namespace,event_id,kind,subject,revision,payload,semantic_hash,receipt)
 VALUES(b.tenant_id,b.id,b.namespace,input->>'eventId',v_kind,input->>'subject',(input->>'revision')::integer,input,h,result);
 -- Append to the existing per-tenant chain, identifiers/hash only. Audit head is the LAST lock.
 payload:=jsonb_build_object('references',jsonb_build_object('bindingId',b.id,'sourceEvent',input->>'eventId'),'hashes',jsonb_build_object('input',h));
 PERFORM set_config('app.tenant_id',b.tenant_id::text,true);
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'version','audit.v1','actorRef','connector:'||b.id::text,
  'eventType','connector.input_staged','subjectType','connector','subjectRef',b.id::text,
  'payload',payload)),'checked_operation');
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
  DELETE FROM control_plane.lp11_connector_input_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN result;
END verified_input;
END $$;

-- The audit hand-off is a narrow maintenance operation. Its login is the
-- synthetic database owner and its witness is the exact locked audit head.
CREATE UNLOGGED TABLE control_plane.lp11_audit_handoff_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 prior_sequence bigint NOT NULL,
 prior_hash text NOT NULL,
 login name NOT NULL
);
ALTER TABLE control_plane.lp11_audit_handoff_scope OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.lp11_audit_handoff_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_audit_handoff_tenant(subject text,actor text,seq text,hash text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_audit_handoff_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND actor='operations:audit-checkpoint-handoff'
  AND (s.tenant_id::text,s.prior_sequence::text,s.prior_hash)=(subject,seq,hash)
$$;
ALTER FUNCTION app.lp11_audit_handoff_tenant(text,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_audit_handoff_tenant(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_audit_handoff_tenant(text,text,text,text) TO jobguard_audit_writer;

CREATE FUNCTION app.lp11_append_audit_handoff(t uuid,seq bigint,hash text,operator text,event_id uuid) RETURNS app.audit_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE head_sequence bigint; head_hash text; sealed app.audit_event;
 saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF current_database()<>'jobguard_synthetic_demo'
  OR session_user::text IS DISTINCT FROM (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
  OR NOT pg_has_role(session_user,'jobguard_migration','MEMBER')
  OR NOT pg_has_role(session_user,'jobguard_runtime','MEMBER')
  OR app.lp6e_request_binding_present()
  OR t IS NULL OR seq IS NULL OR seq<1 OR hash IS NULL OR hash !~ '^[a-f0-9]{64}$'
  OR operator IS NULL OR operator !~ '^[a-zA-Z0-9._-]{1,64}$' OR event_id IS NULL
 THEN RAISE EXCEPTION 'AUDIT_CHECKPOINT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT h.sequence,h.event_hash INTO head_sequence,head_hash FROM app.lock_audit_head() h;
 IF (head_sequence,head_hash) IS DISTINCT FROM (seq,hash) THEN
  RAISE EXCEPTION 'AUDIT_CHECKPOINT_DISAGREEMENT' USING ERRCODE='23505';
 END IF;
 INSERT INTO control_plane.lp11_audit_handoff_scope(transaction_id,tenant_id,prior_sequence,prior_hash,login)
 VALUES(pg_current_xact_id(),t,seq,hash,session_user);
 SELECT * INTO sealed FROM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',event_id,'version','audit.v1','actorRef','operations:audit-checkpoint-handoff',
  'eventType','audit.checkpoint.handed_off','subjectType','audit-checkpoint','subjectRef',t::text,
  'payload',jsonb_build_object('references',jsonb_build_object(
   'environment','synthetic_demo','priorSequence',seq::text,'operator',operator,'sessionUser',session_user::text),
   'hashes',jsonb_build_object('priorHead',hash),'classifications',jsonb_build_object('action','security'))
 )),'lower_trust');
 DELETE FROM control_plane.lp11_audit_handoff_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN sealed;
END $$;
ALTER FUNCTION app.lp11_append_audit_handoff(uuid,bigint,text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_append_audit_handoff(uuid,bigint,text,text,uuid) FROM PUBLIC;

DO $cutover$
DECLARE
 policy_row record;
 policy_role record;
 authority_expression text;
 expression_using text;
 expression_check text;
 tenant_setting_pattern constant text := $pattern$(?:pg_catalog\.)?current_setting\('app\.tenant_id'(?:::text)?(?:,\s*true)?\)$pattern$;
BEGIN
 -- Inspect every alternative, including policies for privileged routine owners.
 -- ALTER retains command, roles, permissive/restrictive mode and all additional
 -- predicates (including bootstrap predicates unrelated to the tenant setting).
 FOR policy_row IN
  SELECT p.oid, p.polname, n.nspname, c.relname, p.polroles,
   pg_get_expr(p.polqual,p.polrelid) AS predicate_using,
   pg_get_expr(p.polwithcheck,p.polrelid) AS predicate_check
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp_'
  ORDER BY n.nspname,c.relname,p.polname
 LOOP
  IF 0=ANY(policy_row.polroles) AND EXISTS(
   SELECT FROM pg_attribute a JOIN pg_policy p ON p.polrelid=a.attrelid
   WHERE p.oid=policy_row.oid AND a.attname='tenant_id' AND NOT a.attisdropped
  ) THEN
   RAISE EXCEPTION 'LP11_PUBLIC_TENANT_POLICY' USING ERRCODE='42501';
  END IF;
  authority_expression := 'app.lp11_policy_tenant()::text';
  -- The worker has no table access. Permit its definer handlers' protected
  -- scope on the tables used by the authorization, lease and executor paths.
  IF policy_row.nspname='app' AND policy_row.relname=ANY(ARRAY[
   'action_outbox','action_attempt','action_authorization','decision_resolution','membership',
   'contractor_membership_revocation','audit_event','audit_head','extra_client_link',
   'extra_client_link_closure','extra_approval_request','extra_approval_step','extra_approval_line',
   'job','final_account_lock','purchase_order_revision','purchase_order_draft','material_requirement',
   'merchant_sku','material_rate_revision','material_pack_conversion','recovery_message_approval',
   'recovery_message_sink','sandbox_run_event'
  ]) AND policy_row.polroles && ARRAY['jobguard_migration'::regrole::oid,'jobguard_audit_writer'::regrole::oid] THEN
   authority_expression := format(
    'coalesce(CASE WHEN current_user IN (''jobguard_migration'',''jobguard_audit_writer'') THEN app.lp11_worker_tenant(%s) END,app.lp11_policy_tenant())::text',
    CASE policy_row.relname
     WHEN 'action_outbox' THEN 'id'
     WHEN 'action_attempt' THEN 'action_id'
     ELSE 'NULL::uuid'
    END);
  END IF;
  IF policy_row.nspname='app' AND policy_row.relname IN ('account','membership')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   authority_expression := replace(authority_expression,'app.lp11_policy_tenant()',
    '(CASE WHEN current_user=''jobguard_migration'' AND app.lp11_new_tenant(tenant_id) THEN tenant_id ELSE app.lp11_policy_tenant() END)');
  END IF;
  IF 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   IF policy_row.nspname='identity' AND policy_row.relname IN('sso_request','oidc_request') THEN
    authority_expression := 'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''cache'',''complete''],connection_id) END)::text';
   ELSIF policy_row.nspname='identity' AND policy_row.relname IN ('verified_domain','idp_group_role_mapping','sso_assertion_use','oidc_assertion_use','scim_event') THEN
    authority_expression := format('coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(%s,connection_id) END)::text',
     CASE WHEN policy_row.relname='scim_event' THEN 'ARRAY[''scim'']' ELSE 'ARRAY[''complete'']' END);
   ELSIF (policy_row.nspname='identity' AND policy_row.relname IN ('sso_subject','sso_session_binding','sso_grant'))
    OR (policy_row.nspname='app' AND policy_row.relname IN ('account','membership','contractor_member','contractor_membership_revocation','role_grant','role_grant_revocation','commercial_track_assignment','contractor_agreement_status_revision')) THEN
    authority_expression := replace(authority_expression,'app.lp11_policy_tenant()',
     'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''complete'',''scim''],NULL) END)');
   END IF;
  END IF;
  IF (policy_row.nspname='identity' AND policy_row.relname IN ('emergency_request','emergency_approval','emergency_session','emergency_action')
   OR policy_row.nspname='app' AND policy_row.relname IN ('membership','role_grant','role_grant_revocation'))
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''dark_emergency''],NULL)::text END)',authority_expression);
  END IF;
  IF (policy_row.nspname,policy_row.relname)=('audit_control','audit_head')
   AND 'jobguard_audit_writer'::regrole::oid=ANY(policy_row.polroles) THEN
   authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_audit_writer'' THEN app.lp11_sso_tenant(ARRAY[''dark_emergency'',''scim2_configure'',''scim2_machine''],NULL)::text END)',authority_expression);
  END IF;
  IF policy_row.nspname='identity' AND policy_row.relname IN ('sso_required_event','sso_emergency_approval',
    'sso_emergency_use','sso_emergency_window','sso_emergency_event')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''mailbox_emergency''],NULL)::text END)',authority_expression);
  END IF;
  IF policy_row.nspname='identity' AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   IF policy_row.relname IN ('scim2_binding','scim2_resource','scim2_receipt') THEN
    authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''scim2_configure'',''scim2_machine''],%s)::text END)',authority_expression,
     CASE WHEN policy_row.relname='scim2_binding' THEN 'id' ELSE 'binding_id' END);
   ELSIF policy_row.relname IN ('verified_domain','sso_subject') THEN
    authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_scim_connection_tenant(ARRAY[''scim2_machine''],connection_id)::text END)',authority_expression);
   ELSIF policy_row.relname='sso_connection' THEN
    authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_scim_connection_tenant(ARRAY[''scim2_configure''],id)::text END)',authority_expression);
   END IF;
  END IF;
  IF policy_row.nspname='app' AND policy_row.relname IN ('account','membership','contractor_member')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   authority_expression:=format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''scim2_machine''],NULL)::text END)',authority_expression);
  END IF;
  -- Only checked customer routines open this scope. Match the exact job,
  -- customer, grant, session or sponsor in each participating relation.
  IF policy_row.nspname='app' AND policy_row.relname IN (
   'job','job_commercial_track','job_party_current','job_party_binding','contractor_party_binding',
   'customer_revision','customer_portal_grant','customer_portal_session','quote_draft','quote_version',
   'quote_revision','quote_document_version','quote_send','quote_acceptance','quote_acceptance_sequence',
   'acceptance_event','customer_quote_approval','customer_invoice','customer_credit_note',
   'customer_payment','evidence_upload','evidence_object','job_source_original','customer_message_source','watchdog_command_identity','final_account_lock','job_work_state_current','command_receipt','command_lifecycle_claim','membership','contractor_membership_revocation','audit_head','audit_event'
  ) AND policy_row.polroles && ARRAY['jobguard_migration'::regrole::oid,'jobguard_binding_owner'::regrole::oid,'jobguard_audit_writer'::regrole::oid,'jobguard_command_writer'::regrole::oid] THEN
   authority_expression := format(
    'coalesce(%s,CASE WHEN current_user IN (''jobguard_migration'',''jobguard_binding_owner'',''jobguard_audit_writer'',''jobguard_command_writer'') THEN app.lp11_customer_tenant(%s) END::text)',
    authority_expression, CASE policy_row.relname
     WHEN 'job' THEN '''job'',id'
     WHEN 'customer_revision' THEN '''customer'',customer_id'
     WHEN 'customer_portal_grant' THEN '''grant'',id'
     WHEN 'customer_portal_session' THEN '''session'',id'
     WHEN 'membership' THEN '''issuer'',id'
     WHEN 'contractor_membership_revocation' THEN '''issuer'',membership_id'
     WHEN 'audit_event' THEN '''audit'',NULL'
     WHEN 'command_receipt' THEN '''command'',command_id'
     WHEN 'command_lifecycle_claim' THEN '''command'',command_id'
     WHEN 'audit_head' THEN '''audit'',NULL'
     ELSE '''job'',job_id' END);
   IF policy_row.relname='job' THEN
    authority_expression := format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_delegated_job_tenant(id)::text END)',authority_expression);
   END IF;
  END IF;
  -- The legacy track trigger can write only the row being stamped after
  -- a direct maintenance insert. Other maintenance operations are read-only.
  IF (policy_row.nspname,policy_row.relname)=('app','job_commercial_track')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   authority_expression := format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_maintenance_track_tenant(job_id)::text END)',authority_expression);
  END IF;
  -- Dedicated shadow-worker authority is qualified by the recorded job.
  IF policy_row.nspname='app' AND policy_row.relname IN(
   'job','job_commercial_track','job_import_v3','job_work_state_current','job_finding',
   'final_account_lock','final_account_lock_check','final_account_line','final_check_terms_acceptance',
   'final_check_manifest','final_check_manifest_source','final_check_processing_source','final_check_source_attempt',
   'final_check_run_binding','final_check_reveal_proof','shadow_final_check_source_attempt','shadow_final_check_run_binding',
   'shadow_final_check_reveal_proof','shadow_final_check_completion','shadow_commercial_signal',
   'shadow_signal_evidence','shadow_reconciliation_run','shadow_signal_classification',
   'shadow_signal_ineligibility','shadow_signal_disposition','shadow_signal_match','shadow_must_surface_firing',
   'shadow_disclosure_event','shadow_break_glass_access','evidence_object','evidence_upload','supplier_document','supplier_document_version',
   'purchase_order_revision','quote_version','job_record_proposal','audit_head'
  ) AND policy_row.polroles && ARRAY['jobguard_migration'::regrole::oid,'jobguard_shadow'::regrole::oid,'jobguard_audit_writer'::regrole::oid] THEN
   authority_expression:=format(
    'coalesce(%s,CASE WHEN current_user IN (''jobguard_migration'',''jobguard_audit_writer'') OR pg_has_role(current_user,''jobguard_shadow'',''USAGE'') THEN app.lp11_shadow_job_tenant(%s)::text END)',
    authority_expression,CASE policy_row.relname
      WHEN 'job' THEN 'id,NULL,''job'''
      WHEN 'final_check_terms_acceptance' THEN 'NULL,practice_session_digest,''terms'''
      WHEN 'audit_head' THEN 'NULL,NULL,''audit'''
      ELSE 'job_id,NULL,''job''' END);
  END IF;
  expression_using := regexp_replace(policy_row.predicate_using,
   tenant_setting_pattern, authority_expression, 'g');
  IF policy_row.nspname='app' AND policy_row.relname IN ('job','job_party_current','job_party_binding','customer_revision','site_revision','evidence_upload','final_account_lock','evidence_object','final_check_manifest','final_check_manifest_source','customer_invoice','final_account_invoice_binding','job_commercial_track','supplier_document','job_work_state_event')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using := regexp_replace(policy_row.predicate_using,tenant_setting_pattern,
    format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_maintenance_job_tenant(%s) END::text)',
     authority_expression,CASE policy_row.relname
      WHEN 'job' THEN 'id,NULL,NULL'
      WHEN 'customer_revision' THEN 'NULL,id,NULL'
      WHEN 'site_revision' THEN 'NULL,NULL,id'
      ELSE 'job_id,NULL,NULL' END),'g');
  END IF;
  IF (policy_row.nspname,policy_row.relname)=('app','evidence_object')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using:=regexp_replace(expression_using,'app\.lp11_policy_tenant\(\)',
    'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_maintenance_evidence_tenant(id) END)','g');
  END IF;
  -- Final-check workers must apply the same closed-job check as requests.
  IF (policy_row.nspname,policy_row.relname)=('app','job_work_state_event')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using:=regexp_replace(expression_using,'app\.lp11_policy_tenant\(\)',
    'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_shadow_job_tenant(job_id,NULL,''job'') END)','g');
  END IF;
  expression_check := regexp_replace(policy_row.predicate_check,
   tenant_setting_pattern, authority_expression, 'g');

  IF (policy_row.nspname,policy_row.relname)=('app','membership')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using := regexp_replace(policy_row.predicate_using,tenant_setting_pattern,
    format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' AND app.lp11_invitation_membership(tenant_id,account_id,id,identity_user_id,role,false) THEN tenant_id::text END)',
     authority_expression),'g');
   expression_check := regexp_replace(policy_row.predicate_check,tenant_setting_pattern,
    format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' AND app.lp11_invitation_membership(tenant_id,account_id,id,identity_user_id,role,true) THEN tenant_id::text END)',
     authority_expression),'g');
  ELSIF policy_row.nspname='app' AND policy_row.relname IN ('contractor_membership_revocation','commercial_track_assignment','contractor_agreement_status_revision')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using := regexp_replace(policy_row.predicate_using,tenant_setting_pattern,
    format('coalesce(%s,CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_invitation_tenant()::text END)',
     authority_expression),'g');
  END IF;
  -- Permission graph traversal is read-only and requires the connection scope.
  IF ((policy_row.nspname='app' AND policy_row.relname IN('org_unit','team','team_membership','client_organisation','membership',
   'contractor_member','contractor_membership_revocation','role_grant','role_grant_revocation'))
   OR (policy_row.nspname='identity' AND policy_row.relname IN('sso_subject','sso_session_binding','sso_grant')))
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using := regexp_replace(expression_using,'app\.lp11_policy_tenant\(\)',
    'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''worker_authorize''],NULL) END)','g');
  END IF;
  IF policy_row.nspname='app' AND policy_row.relname IN ('membership','contractor_member','contractor_membership_revocation',
   'commercial_track_assignment','contractor_agreement_status_revision','role_grant','role_grant_revocation')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using:=regexp_replace(expression_using,'app\.lp11_policy_tenant\(\)',
    'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''mailbox_emergency''],NULL) END)','g');
  END IF;
  IF (policy_row.nspname,policy_row.relname)=('identity','emergency_approval')
   AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles) THEN
   expression_using:=regexp_replace(expression_using,'app\.lp11_policy_tenant\(\)',
    'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration'' THEN app.lp11_sso_tenant(ARRAY[''scim2_machine''],NULL) END)','g');
  END IF;
  -- The worker reads only sources for the approved recovery action. Its
  -- source-validation reads never relax the proposed-row checks.
  IF policy_row.nspname='app' AND 'jobguard_migration'::regrole::oid=ANY(policy_row.polroles)
   AND policy_row.relname IN('recovery_message','recovery_case','recovery_claim_revision','recovery_case_event',
    'recovery_case_terms_approval',
    'landing_allocation','landing_reversal','quote_acceptance','quote_acceptance_sequence','quote_document_version',
    'evidence_object','evidence_upload','evidence_invalidation','synthetic_evidence_original','variation_revision',
    'variation_approval','supplier_document','supplier_document_version','customer_invoice','evidence_pack_revision',
    'evidence_pack_attachment_approval','recovery_follow_up','recovery_follow_up_event','recovery_follow_up_reminder') THEN
   expression_using := regexp_replace(expression_using,'app\.lp11_policy_tenant\(\)',format(
    'coalesce(app.lp11_policy_tenant(),CASE WHEN current_user=''jobguard_migration''
     THEN app.lp11_recovery_worker_tenant(%s) END)',
    CASE policy_row.relname
      WHEN 'recovery_message' THEN 'job_id,case_id,id,NULL,''row'''
      WHEN 'recovery_case' THEN 'job_id,id,NULL,NULL,''row'''
      WHEN 'landing_reversal' THEN 'job_id,NULL,NULL,allocation_id,''allocation'''
      WHEN 'evidence_invalidation' THEN 'NULL,NULL,NULL,evidence_id,''evidence'''
      WHEN 'recovery_follow_up_reminder' THEN 'job_id,case_id,message_id,NULL,''row'''
      WHEN 'recovery_claim_revision' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'recovery_case_event' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'recovery_case_terms_approval' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'landing_allocation' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'evidence_pack_revision' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'evidence_pack_attachment_approval' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'recovery_follow_up' THEN 'job_id,case_id,NULL,NULL,''row'''
      WHEN 'recovery_follow_up_event' THEN 'job_id,case_id,NULL,NULL,''row'''
      ELSE 'job_id,NULL,NULL,NULL,''row''' END),'g');
  END IF;
  IF expression_using IS DISTINCT FROM policy_row.predicate_using
   OR expression_check IS DISTINCT FROM policy_row.predicate_check THEN
   -- These roles already participate in tenant policies. Unknown principals
   -- require a reviewed grant/proof, never automatic privilege expansion.
   -- PUBLIC is deliberately refused instead of broadening function access.
   IF 0 = ANY(policy_row.polroles) THEN
    RAISE EXCEPTION 'LP11_PUBLIC_TENANT_POLICY' USING ERRCODE='42501';
   END IF;
   EXECUTE format('ALTER POLICY %I ON %I.%I%s%s',policy_row.polname,
    policy_row.nspname,policy_row.relname,
    CASE WHEN expression_using IS NULL THEN '' ELSE format(' USING (%s)',expression_using) END,
    CASE WHEN expression_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)',expression_check) END);
   FOR policy_role IN SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(policy_row.polroles)
   LOOP
    IF NOT has_function_privilege(policy_role.rolname,'app.lp11_policy_tenant()','EXECUTE') THEN
     RAISE EXCEPTION 'LP11_UNREVIEWED_POLICY_ROLE: %',policy_role.rolname USING ERRCODE='42501';
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF EXISTS (
  SELECT FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp_' AND
   (coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
    LIKE '%app.tenant_id%'
 ) THEN
  RAISE EXCEPTION 'LP11_UNCONVERTED_TENANT_POLICY' USING ERRCODE='42501';
 END IF;
END $cutover$;

-- Keep the synthetic home membership bootstrap scoped to the two fixture
-- tenants, and close the alternative whenever a different request is bound.
ALTER POLICY practice_membership_lookup ON app.membership USING (
 current_database()='jobguard_synthetic_demo'
 AND (tenant_id,id) IN (('11111111-1111-4111-8111-111111111111'::uuid,'d1500000-0000-4000-8000-000000000003'::uuid),
  ('33333333-3333-4333-8333-333333333333'::uuid,'33333333-3333-4333-8333-333333333335'::uuid))
 AND CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant() ELSE true END
);

-- The audit owners can perform maintenance from a migration login. Request
-- and worker sessions do not gain the owner's unbound maintenance authority.
ALTER POLICY lp4_audit_writer ON app.audit_event USING (
 tenant_id=coalesce(app.lp11_policy_tenant(),app.lp11_worker_tenant(NULL),
  CASE WHEN subject_type='sso-connection' AND event_type LIKE 'sso.%' THEN app.lp11_sso_tenant(ARRAY['audit'],subject_ref::uuid) END,
  app.lp11_identity_operation_audit_tenant(event_type,subject_type,subject_ref,actor_ref),
  CASE WHEN subject_type='connector' AND event_type='connector.input_staged'
   THEN app.lp11_connector_audit_tenant(subject_ref,actor_ref) END,
  CASE WHEN subject_type='audit-checkpoint' AND event_type='audit.checkpoint.handed_off'
   THEN app.lp11_audit_handoff_tenant(subject_ref,actor_ref,payload#>>'{references,priorSequence}',payload#>>'{hashes,priorHead}') END,
  CASE WHEN (subject_type='customer_portal' AND event_type IN('customer_portal.signed_in','customer_portal.signed_out'))
     OR (subject_type='quote_document' AND event_type='quote.acceptance.customer_authenticated')
     OR (subject_type='job' AND event_type IN('job_source.customer_message_recorded','customer_portal.message_recorded'))
   THEN app.lp11_customer_tenant('audit',NULL) END,
  CASE WHEN subject_type='customer_portal' AND event_type='customer_portal.stage_acknowledged'
    AND pg_input_is_valid(subject_ref,'uuid')
   THEN app.lp11_customer_tenant('stage_command',subject_ref::uuid) END,
  CASE WHEN subject_type='customer_portal' AND event_type='customer_portal.variation_approved'
    AND pg_input_is_valid(subject_ref,'uuid')
   THEN app.lp11_customer_tenant('variation_command',subject_ref::uuid) END,
  CASE WHEN subject_type='job' AND (event_type LIKE 'final_check.%' OR event_type IN ('shadow.disclosed','shadow.must_surface_fired','shadow.emergency_read')) AND pg_input_is_valid(subject_ref,'uuid')
   THEN app.lp11_shadow_job_tenant(subject_ref::uuid,NULL,'audit') END,
  CASE WHEN subject_type='job' AND event_type='command.succeeded'
    AND pg_input_is_valid(payload->'references'->>'commandId','uuid')
   THEN app.lp11_customer_tenant('command',(payload->'references'->>'commandId')::uuid) END)
 OR app.lp11_practice_revoke_event(tenant_id,event_type,subject_type,subject_ref,actor_ref)
) WITH CHECK (
 tenant_id=coalesce(app.lp11_policy_tenant(),app.lp11_worker_tenant(NULL),
  CASE WHEN subject_type='sso-connection' AND event_type LIKE 'sso.%' THEN app.lp11_sso_tenant(ARRAY['audit'],subject_ref::uuid) END,
  app.lp11_identity_operation_audit_tenant(event_type,subject_type,subject_ref,actor_ref),
  CASE WHEN subject_type='connector' AND event_type='connector.input_staged'
   THEN app.lp11_connector_audit_tenant(subject_ref,actor_ref) END,
  CASE WHEN subject_type='audit-checkpoint' AND event_type='audit.checkpoint.handed_off'
   THEN app.lp11_audit_handoff_tenant(subject_ref,actor_ref,payload#>>'{references,priorSequence}',payload#>>'{hashes,priorHead}') END,
  CASE WHEN (subject_type='customer_portal' AND event_type IN('customer_portal.signed_in','customer_portal.signed_out'))
     OR (subject_type='quote_document' AND event_type='quote.acceptance.customer_authenticated')
     OR (subject_type='job' AND event_type IN('job_source.customer_message_recorded','customer_portal.message_recorded'))
   THEN app.lp11_customer_tenant('audit',NULL) END,
  CASE WHEN subject_type='customer_portal' AND event_type='customer_portal.stage_acknowledged'
    AND pg_input_is_valid(subject_ref,'uuid')
   THEN app.lp11_customer_tenant('stage_command',subject_ref::uuid) END,
  CASE WHEN subject_type='customer_portal' AND event_type='customer_portal.variation_approved'
    AND pg_input_is_valid(subject_ref,'uuid')
   THEN app.lp11_customer_tenant('variation_command',subject_ref::uuid) END,
  CASE WHEN subject_type='job' AND (event_type LIKE 'final_check.%' OR event_type IN ('shadow.disclosed','shadow.must_surface_fired','shadow.emergency_read')) AND pg_input_is_valid(subject_ref,'uuid')
   THEN app.lp11_shadow_job_tenant(subject_ref::uuid,NULL,'audit') END,
  CASE WHEN subject_type='job' AND event_type='command.succeeded'
    AND pg_input_is_valid(payload->'references'->>'commandId','uuid')
   THEN app.lp11_customer_tenant('command',(payload->'references'->>'commandId')::uuid) END)
 OR app.lp11_practice_revoke_event(tenant_id,event_type,subject_type,subject_ref,actor_ref)
);
ALTER POLICY migration_audit_integrity ON app.audit_event USING (
 CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant()
 ELSE pg_has_role(session_user,'jobguard_migration','SET') END
 OR app.lp11_practice_revoke_event(tenant_id,event_type,subject_type,subject_ref,actor_ref)
);
ALTER POLICY migration_integrity ON app.audit_export USING (
 CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant()
 ELSE pg_has_role(session_user,'jobguard_migration','SET') END
) WITH CHECK (
 CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant()
 ELSE pg_has_role(session_user,'jobguard_migration','SET') END
);
ALTER POLICY migration_integrity ON app.audit_export_checkpoint USING (
 CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant()
 ELSE pg_has_role(session_user,'jobguard_migration','SET') END
) WITH CHECK (
 CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant()
 ELSE pg_has_role(session_user,'jobguard_migration','SET') END
);
ALTER POLICY firm_profile_bound_reader ON app.firm_profile
 USING (tenant_id=app.lp11_policy_tenant() AND app.firm_profile_access(tenant_id,company_key,false));
ALTER POLICY firm_profile_read ON app.firm_profile
 USING (tenant_id=app.lp11_policy_tenant() AND app.firm_profile_access(tenant_id,company_key,false));
ALTER POLICY firm_profile_insert ON app.firm_profile
 WITH CHECK (tenant_id=app.lp11_policy_tenant() AND app.firm_profile_access(tenant_id,company_key,true));
ALTER POLICY firm_profile_update ON app.firm_profile
 USING (tenant_id=app.lp11_policy_tenant() AND app.firm_profile_access(tenant_id,company_key,true))
 WITH CHECK (tenant_id=app.lp11_policy_tenant() AND app.firm_profile_access(tenant_id,company_key,true));

-- Preserve existing identity/connector resource lookup rules only in their
-- pre-request roles. A bound request cannot broad-read a different tenant
-- through those permissive alternatives inside a definer.
ALTER POLICY binding_lookup ON identity.scim2_binding USING (
 app.lp11_scim_binding_lookup(id)
);
ALTER POLICY connection_lookup ON identity.sso_connection USING (
 id=nullif(current_setting('app.sso_connection_id',true),'')::uuid
 AND CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant() ELSE true END
);
ALTER POLICY session_lookup ON identity.sso_session_binding USING (
 session_id=nullif(current_setting('app.sso_session_id',true),'')::uuid
 AND CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant() ELSE true END
);
DO $connector$
DECLARE table_name text; policy_name text;
 bound_check constant text := 'CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant() ELSE true END';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['binding','machine_capability','machine_command','machine_connection','machine_key','machine_nonce'] LOOP
  policy_name:=CASE WHEN table_name='binding' THEN 'binding_lookup' ELSE 'machine_control' END;
  EXECUTE format('ALTER POLICY %I ON connector.%I USING (%s) WITH CHECK (%s)',policy_name,table_name,bound_check,bound_check);
 END LOOP;
END $connector$;

ALTER POLICY tenant_intake ON connector.input_event
 USING (tenant_id=coalesce(app.lp11_policy_tenant(),connector.lp11_input_tenant(namespace)))
 WITH CHECK (tenant_id=coalesce(app.lp11_policy_tenant(),connector.lp11_input_tenant(namespace,binding_id)));


-- Shadow decision and invalidation reads are owned by the migration role.
-- Runtime never needs EXECUTE on the subject lookup functions.
CREATE POLICY lp11_shadow_decision_read ON app.decision FOR SELECT TO jobguard_migration
 USING (subject_type='shadow_signal' AND action_type='review_must_surface_signal'
  AND tenant_id=app.lp11_shadow_decision_tenant(subject_ref));
CREATE POLICY lp11_shadow_decision_insert ON app.decision FOR INSERT TO jobguard_migration
 WITH CHECK (subject_type='shadow_signal' AND action_type='review_must_surface_signal'
  AND tenant_id=app.lp11_shadow_decision_tenant(subject_ref));
CREATE POLICY lp11_shadow_invalidation_read ON app.evidence_invalidation FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_shadow_evidence_tenant(evidence_id));

-- Retain the SELECT-only alternatives, now limited to the authenticated
-- stage operation and job. The indirect rows have no job column.
ALTER POLICY customer_stage_source ON app.stage_completion
 USING (tenant_id=app.lp11_customer_tenant('stage_job',job_id));
ALTER POLICY customer_stage_source ON app.evidence_link
 USING (tenant_id=app.lp11_customer_tenant('stage_job',job_id));
ALTER POLICY customer_stage_source ON app.stage_review_event
 USING (EXISTS(SELECT 1 FROM app.stage_completion s
  WHERE (s.tenant_id,s.id)=(stage_review_event.tenant_id,stage_review_event.stage_completion_id)
   AND s.tenant_id=app.lp11_customer_tenant('stage_job',s.job_id)));
ALTER POLICY customer_stage_source ON app.evidence_invalidation
 USING (EXISTS(SELECT 1 FROM app.evidence_object e
  WHERE (e.tenant_id,e.id)=(evidence_invalidation.tenant_id,evidence_invalidation.evidence_id)
   AND e.tenant_id=app.lp11_customer_tenant('stage_job',e.job_id)));
ALTER POLICY tenant_isolation ON app.customer_stage_acknowledgement
 USING (tenant_id=app.lp11_policy_tenant() OR (
  tenant_id=app.lp11_customer_tenant('stage_job',job_id)
  AND tenant_id=app.lp11_customer_tenant('stage_customer',customer_id)))
 WITH CHECK (tenant_id=app.lp11_policy_tenant() OR (
  tenant_id=app.lp11_customer_tenant('stage_job',job_id)
  AND tenant_id=app.lp11_customer_tenant('stage_customer',customer_id)
  AND tenant_id=app.lp11_customer_tenant('stage_session',session_id)));

-- The checked variation uses only the exact portal job and selected write targets.
DO $customer_variation$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['variation','variation_revision','variation_approval','variation_rejection','extra_origin','recovery_case','recovery_claim_revision'] LOOP
  EXECUTE format('CREATE POLICY lp11_customer_variation_read ON app.%I FOR SELECT TO jobguard_migration
   USING (tenant_id=app.lp11_customer_tenant(''variation_job'',job_id))',relation);
 END LOOP;
END $customer_variation$;
CREATE POLICY lp11_customer_variation_update ON app.variation FOR UPDATE TO jobguard_migration
 USING (tenant_id=app.lp11_customer_tenant('variation_job',job_id)
  AND tenant_id=app.lp11_customer_tenant('variation_target',id))
 WITH CHECK (tenant_id=app.lp11_customer_tenant('variation_job',job_id)
  AND tenant_id=app.lp11_customer_tenant('variation_target',id) AND state='approved');
CREATE POLICY lp11_customer_variation_insert ON app.variation_approval FOR INSERT TO jobguard_migration
 WITH CHECK (tenant_id=app.lp11_customer_tenant('variation_job',job_id)
  AND tenant_id=app.lp11_customer_tenant('variation_target',variation_id)
  AND tenant_id=app.lp11_customer_tenant('variation_command',id) AND method='customer_authenticated');
ALTER POLICY tenant_isolation ON app.customer_variation_approval
 USING (tenant_id=app.lp11_policy_tenant() OR (
  tenant_id=app.lp11_customer_tenant('variation_session',customer_session_id)
  AND tenant_id=app.lp11_customer_tenant('variation_command',variation_approval_id)))
 WITH CHECK (tenant_id=app.lp11_policy_tenant() OR (
  tenant_id=app.lp11_customer_tenant('variation_session',customer_session_id)
  AND tenant_id=app.lp11_customer_tenant('variation_command',variation_approval_id)));
CREATE POLICY lp11_customer_variation_insert ON app.scope_progress FOR INSERT TO jobguard_migration
 WITH CHECK (tenant_id=app.lp11_customer_tenant('variation_job',job_id)
  AND tenant_id=app.lp11_customer_tenant('variation_scope_item',scope_item_id)
  AND stage='not_started' AND revision=0);
CREATE POLICY lp11_customer_variation_insert ON app.recovery_claim_revision FOR INSERT TO jobguard_migration
 WITH CHECK (tenant_id=app.lp11_customer_tenant('variation_job',job_id) AND revision=1
  AND CASE WHEN reviewer_ref LIKE 'customer-session:%'
   AND pg_input_is_valid(substr(reviewer_ref,18),'uuid')
   THEN tenant_id=app.lp11_customer_tenant('variation_session',substr(reviewer_ref,18)::uuid)
   ELSE false END
  AND EXISTS(SELECT 1 FROM app.recovery_case c
   JOIN app.variation v ON (v.tenant_id,v.job_id)=(c.tenant_id,c.job_id)
   WHERE (c.tenant_id,c.job_id,c.id)=(recovery_claim_revision.tenant_id,recovery_claim_revision.job_id,recovery_claim_revision.case_id)
    AND c.case_type='missed_variation_final_account' AND c.source_refs ? ('variation:'||v.id::text)
    AND v.tenant_id=app.lp11_customer_tenant('variation_target',v.id)));

-- The synthetic accounting writer is separate from request and shadow detection
-- authority. The receipt FK witnesses the exact stored tenant/job pair.
CREATE UNLOGGED TABLE control_plane.lp11_accounting_receipt_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 evidence_id uuid NOT NULL,
 version_id text NOT NULL,
 login name NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE control_plane.lp11_accounting_receipt_scope OWNER TO jobguard_migration;
REVOKE ALL ON TABLE control_plane.lp11_accounting_receipt_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_accounting_receipt_tenant(j uuid,e uuid,v text) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_accounting_receipt_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND s.expires_at>clock_timestamp() AND (s.job_id,s.evidence_id,s.version_id)=(j,e,v)
$$;
ALTER FUNCTION app.lp11_accounting_receipt_tenant(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_accounting_receipt_tenant(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_accounting_receipt_tenant(uuid,uuid,text) TO jobguard_shadow;

CREATE FUNCTION app.lp11_insert_accounting_receipt(t uuid,e uuid,v text,j uuid,h text)
 RETURNS TABLE(evidence_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE tenant uuid:=app.lp11_policy_tenant(); expiry timestamptz:=clock_timestamp()+interval '5 minutes';
BEGIN
 IF t IS NULL OR j IS NULL OR e IS NULL OR v IS NULL
  OR current_database()<>'jobguard_synthetic_demo'
  OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE')
  OR pg_has_role(session_user,'jobguard_runtime','USAGE')
  OR (tenant IS NOT NULL AND t<>tenant) THEN
  RAISE EXCEPTION 'ACCOUNTING_BINDING_MISMATCH' USING ERRCODE='42501';
 END IF;
 DELETE FROM control_plane.lp11_accounting_receipt_scope s
 WHERE s.expires_at<=clock_timestamp() AND s.transaction_id<>pg_current_xact_id();
 INSERT INTO control_plane.lp11_accounting_receipt_scope AS s
 VALUES (pg_current_xact_id(),t,j,e,v,session_user,expiry)
 ON CONFLICT(transaction_id) DO UPDATE SET
  job_id=EXCLUDED.job_id,evidence_id=EXCLUDED.evidence_id,version_id=EXCLUDED.version_id
 WHERE (s.tenant_id,s.login)=(EXCLUDED.tenant_id,EXCLUDED.login) AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_BINDING_MISMATCH' USING ERRCODE='42501'; END IF;
 RETURN QUERY INSERT INTO app.accounting_observation_receipt AS receipt
  (tenant_id,evidence_id,object_version_id,job_id,observation_hash)
  VALUES(t,e,v,j,h) ON CONFLICT ON CONSTRAINT accounting_observation_receipt_pkey DO NOTHING
  RETURNING receipt.evidence_id;
END $$;
ALTER FUNCTION app.lp11_insert_accounting_receipt(uuid,uuid,text,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_insert_accounting_receipt(uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_insert_accounting_receipt(uuid,uuid,text,uuid,text) TO jobguard_shadow;

CREATE POLICY lp11_accounting_receipt_read ON app.accounting_observation_receipt FOR SELECT TO jobguard_shadow,jobguard_migration
 USING (tenant_id=app.lp11_accounting_receipt_tenant(job_id,evidence_id,object_version_id));
CREATE POLICY lp11_accounting_receipt_insert ON app.accounting_observation_receipt FOR INSERT TO jobguard_migration
 WITH CHECK (tenant_id=app.lp11_accounting_receipt_tenant(job_id,evidence_id,object_version_id));

-- Readiness discovery has no member request. The infrastructure entry point
-- enumerates registered tenants and exposes only due plan identifiers.
CREATE UNLOGGED TABLE control_plane.lp11_readiness_scope (
 transaction_id xid8 PRIMARY KEY,
 tenant_id uuid NOT NULL,
 job_id uuid,
 task_id uuid,
 purpose text NOT NULL,
 login name NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK ((purpose='discovery' AND job_id IS NULL AND task_id IS NULL)
     OR (purpose='worker' AND job_id IS NOT NULL AND task_id IS NOT NULL))
);
ALTER TABLE control_plane.lp11_readiness_scope OWNER TO jobguard_migration;
REVOKE ALL ON TABLE control_plane.lp11_readiness_scope FROM PUBLIC;

CREATE FUNCTION app.lp11_readiness_tenant(p_purpose text,p_job uuid,p_task uuid) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT s.tenant_id FROM control_plane.lp11_readiness_scope s
 WHERE s.transaction_id=pg_current_xact_id_if_assigned() AND s.login=session_user
  AND s.purpose=p_purpose AND s.expires_at>clock_timestamp()
  AND (p_job IS NULL OR s.job_id=p_job) AND (p_task IS NULL OR s.task_id=p_task)
$$;
ALTER FUNCTION app.lp11_readiness_tenant(text,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_readiness_tenant(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_readiness_tenant(text,uuid,uuid) TO jobguard_audit_writer;

-- Latest definition: 0718_readiness_timezone_case.sql. Keep its ordering,
-- cap, date computation and case-insensitive timezone validation.
CREATE OR REPLACE FUNCTION infrastructure.discover_readiness_plans()
RETURNS TABLE(tenant_id uuid,job_id uuid,task_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 tenant uuid;
 emitted integer := 0;
 added integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF app.lp11_policy_tenant() IS NOT NULL OR NOT pg_has_role(session_user,'jobguard_infrastructure','USAGE') THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 DELETE FROM control_plane.lp11_readiness_scope WHERE expires_at<=clock_timestamp();
 FOR tenant IN SELECT t.id FROM control_plane.tenant t ORDER BY t.id LOOP
  INSERT INTO control_plane.lp11_readiness_scope
  VALUES (pg_current_xact_id(),tenant,NULL,NULL,'discovery',session_user,clock_timestamp()+interval '1 minute');
  RETURN QUERY
   SELECT latest.tenant_id,latest.job_id,latest.task_id FROM (
    SELECT DISTINCT ON(p.tenant_id,p.job_id,p.task_id)
     p.tenant_id,p.job_id,p.task_id,p.payload
    FROM app.scheduled_readiness_plan p WHERE p.tenant_id=tenant
    ORDER BY p.tenant_id,p.job_id,p.task_id,p.fact_revision DESC
   ) latest WHERE latest.payload->>'status'='confirmed'
    AND CASE WHEN EXISTS (
     SELECT 1 FROM pg_catalog.pg_timezone_names zone
     WHERE lower(zone.name)=lower(latest.payload->>'timeZone')
    ) THEN (latest.payload->>'plannedDate')::date >=
     (CURRENT_TIMESTAMP AT TIME ZONE (latest.payload->>'timeZone'))::date
    ELSE false END
   ORDER BY latest.job_id,latest.task_id LIMIT (100-emitted);
  GET DIAGNOSTICS added = ROW_COUNT;
  DELETE FROM control_plane.lp11_readiness_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
  emitted := emitted+added;
  EXIT WHEN emitted>=100;
 END LOOP;
END $$;

-- The isolated worker follows the exact queued plan. The current stored plan
-- and its hash fence proposal creation and the audit record.
CREATE FUNCTION app.lp11_readiness_worker(t uuid,j uuid,task uuid,operation text,proposal jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE plan app.scheduled_readiness_plan; result jsonb; audit_id uuid:=gen_random_uuid();
 previous_tenant text:=current_setting('app.tenant_id',true); key text:=proposal->>'key';
BEGIN
 PERFORM app.lp10_assert_worker();
 IF current_database()<>'jobguard_synthetic_demo' OR app.lp11_policy_tenant() IS NOT NULL
  OR t IS NULL OR j IS NULL OR task IS NULL OR operation IS NULL
  OR operation NOT IN ('load','load_job','record') OR (operation='record') IS DISTINCT FROM (proposal IS NOT NULL) THEN
  RAISE EXCEPTION 'READINESS_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 DELETE FROM control_plane.lp11_readiness_scope WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.lp11_readiness_scope
 VALUES (pg_current_xact_id(),t,j,task,'worker',session_user,clock_timestamp()+interval '5 minutes');
 IF operation='record' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('readiness-store:'||t::text||':'||j::text||':'||task::text,0));
 END IF;
 SELECT * INTO plan FROM app.scheduled_readiness_plan p
 WHERE (p.tenant_id,p.job_id,p.task_id)=(t,j,task) ORDER BY p.fact_revision DESC LIMIT 1;
 IF operation='load' THEN
  result:=plan.payload;
 ELSIF operation='load_job' THEN
  SELECT coalesce(jsonb_agg(latest.payload ORDER BY latest.task_id),'[]'::jsonb) INTO result FROM (
   SELECT DISTINCT ON (p.task_id) p.task_id,p.payload FROM app.scheduled_readiness_plan p
   WHERE plan.task_id IS NOT NULL AND (p.tenant_id,p.job_id)=(t,j) ORDER BY p.task_id,p.fact_revision DESC
  ) latest WHERE latest.payload->>'status'='confirmed';
 ELSE
  IF plan.task_id IS NULL OR plan.plan_hash IS DISTINCT FROM proposal->>'planHash'
   OR plan.payload->>'status' IS DISTINCT FROM 'confirmed'
   OR lower(proposal#>>'{scope,tenantId}') IS DISTINCT FROM t::text
   OR lower(proposal#>>'{scope,jobId}') IS DISTINCT FROM j::text
   OR lower(proposal#>>'{scope,taskId}') IS DISTINCT FROM task::text
   OR key IS NULL OR key !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'READINESS_STORE_CONFLICT' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.scheduled_readiness_proposal(tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id)
  VALUES(t,j,task,key,plan.plan_hash,proposal,audit_id) ON CONFLICT(tenant_id,proposal_key) DO NOTHING;
  IF FOUND THEN
   -- The sealer consumes the derived tenant. RLS requires the private task
   -- and recognizes only this audit event from the isolated worker.
   PERFORM set_config('app.tenant_id',plan.tenant_id::text,true);
   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
    'id',audit_id,'version','audit.v1','actorRef','system:readiness-rule',
    'eventType','readiness.scheduled_proposal_recorded','subjectType','job','subjectRef',j,
    'payload',jsonb_build_object('references',jsonb_build_object('taskId',task,'proposalKey',key),
     'hashes',jsonb_build_object('planHash',plan.plan_hash),
     'classifications',jsonb_build_object('action','operational')))),'lower_trust');
   PERFORM set_config('app.tenant_id',coalesce(previous_tenant,''),true);
  ELSIF NOT EXISTS(SELECT FROM app.scheduled_readiness_proposal p
   WHERE (p.tenant_id,p.job_id,p.task_id,p.proposal_key)=(t,j,task,key)
    AND p.payload-'evaluatedAt'=proposal-'evaluatedAt') THEN
   RAISE EXCEPTION 'READINESS_STORE_CONFLICT' USING ERRCODE='23514';
  END IF;
 END IF;
 DELETE FROM control_plane.lp11_readiness_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
 RETURN result;
END $$;
ALTER FUNCTION app.lp11_readiness_worker(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp11_readiness_worker(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lp11_readiness_worker(uuid,uuid,uuid,text,jsonb) TO jobguard_worker;

CREATE POLICY lp11_readiness_discovery ON app.scheduled_readiness_plan FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_readiness_tenant('discovery',NULL,NULL));
CREATE POLICY lp11_readiness_worker_read ON app.scheduled_readiness_plan FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_readiness_tenant('worker',job_id,NULL));
CREATE POLICY lp11_readiness_worker_read ON app.scheduled_readiness_proposal FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_readiness_tenant('worker',job_id,task_id));
CREATE POLICY lp11_readiness_worker_insert ON app.scheduled_readiness_proposal FOR INSERT TO jobguard_migration
 WITH CHECK (tenant_id=app.lp11_readiness_tenant('worker',job_id,task_id));
CREATE POLICY lp11_readiness_audit_head ON audit_control.audit_head TO jobguard_audit_writer
 USING (tenant_id=app.lp11_readiness_tenant('worker',NULL,NULL))
 WITH CHECK (tenant_id=app.lp11_readiness_tenant('worker',NULL,NULL));
CREATE POLICY lp11_readiness_audit ON app.audit_event TO jobguard_audit_writer USING (
 subject_type='job' AND event_type='readiness.scheduled_proposal_recorded' AND actor_ref='system:readiness-rule'
 AND CASE WHEN pg_input_is_valid(subject_ref,'uuid') AND pg_input_is_valid(payload#>>'{references,taskId}','uuid')
  THEN tenant_id=app.lp11_readiness_tenant('worker',subject_ref::uuid,(payload#>>'{references,taskId}')::uuid)
  ELSE false END
) WITH CHECK (
 subject_type='job' AND event_type='readiness.scheduled_proposal_recorded' AND actor_ref='system:readiness-rule'
 AND CASE WHEN pg_input_is_valid(subject_ref,'uuid') AND pg_input_is_valid(payload#>>'{references,taskId}','uuid')
  THEN tenant_id=app.lp11_readiness_tenant('worker',subject_ref::uuid,(payload#>>'{references,taskId}')::uuid)
  ELSE false END
);

CREATE POLICY lp11_customer_billing_read ON app.customer_invoice FOR SELECT TO jobguard_migration
 USING (synthetic AND tenant_id=app.lp11_customer_tenant('billing_job',job_id));
CREATE POLICY lp11_customer_billing_read ON app.customer_credit_note FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_customer_tenant('billing_job',job_id));
CREATE POLICY lp11_customer_billing_read ON app.customer_payment FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_customer_tenant('billing_job',job_id));
CREATE POLICY lp11_customer_billing_read ON app.customer_payment_reversal FOR SELECT TO jobguard_migration
 USING (tenant_id=app.lp11_customer_tenant('billing_job',job_id));

-- The ledger view was an owner-rights view. Preserve its security barrier and
-- use caller privileges/RLS, just like the existing parties/recovery views.
ALTER VIEW app.ledger_balance SET (security_invoker=true);
COMMIT;
