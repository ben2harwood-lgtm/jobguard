BEGIN;
-- Forward fix only: keep tenant authority in protected transaction state.
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
 control_plane.practice_session,control_plane.contractor_practice_session,
 control_plane.identity_practice_namespace,control_plane.identity_practice_credential TO jobguard_session_lookup;
-- PostgreSQL requires an UPDATE column privilege for the existing credential
-- locks. Business membership, account and revocation receive SELECT only.
GRANT UPDATE (id) ON identity.session TO jobguard_session_lookup;
GRANT UPDATE (token_digest) ON control_plane.practice_session TO jobguard_session_lookup;
GRANT UPDATE (session_id) ON control_plane.contractor_practice_session TO jobguard_session_lookup;

DO $$ DECLARE rel regclass; BEGIN
 FOREACH rel IN ARRAY ARRAY['app.account','app.membership','app.contractor_membership_revocation','app.contractor_member',
  'identity.sso_subject','identity.sso_required_event','identity.sso_emergency_window']::regclass[] LOOP
  EXECUTE format('CREATE POLICY lp11_credential_lookup ON %s FOR SELECT TO jobguard_session_lookup
   USING (tenant_id=(app.lp11_identity_scope()).tenant_id)',rel);
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
  AND (NOT app.lp6e_request_binding_present() OR app.current_tenant() IS DISTINCT FROM t))
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

CREATE OR REPLACE FUNCTION identity.sso_session_memberships(u uuid,s uuid)
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

CREATE OR REPLACE FUNCTION identity.sso_code_signin_allowed(u uuid)
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

CREATE OR REPLACE FUNCTION identity.sso_required_refusal_target(u uuid,t uuid) RETURNS uuid
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

CREATE OR REPLACE FUNCTION app.lp6_session_authority(p_kind text,p_credential text,p_tenant uuid)
 RETURNS TABLE(session_ref text,actor_id uuid,expires_at timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE linked record; real_session identity.session; home control_plane.practice_session;
 practice control_plane.contractor_practice_session; selected_actor uuid;
 selected_ref text; deadline timestamptz; saved_tenant text:=current_setting('app.tenant_id',true);
 saved_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 IF p_kind='practice' AND EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest=p_credential) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_kind='practice' AND EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest=p_credential) THEN
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
BEGIN
 IF NOT app.lp11_lock_practice_approval(digest,requested_tenant) THEN RETURN; END IF;
 IF requested_tenant NOT IN ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid)
 OR current_database()<>'jobguard_synthetic_demo'
 OR NOT EXISTS(SELECT FROM control_plane.practice_session s WHERE s.token_digest=digest
  AND s.environment='synthetic_demo' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RETURN; END IF;
 PERFORM app.lp11_set_identity_scope(requested_tenant,NULL);
 RETURN QUERY
 SELECT m.tenant_id,m.id,m.identity_user_id FROM control_plane.practice_session s
 JOIN app.membership m ON m.tenant_id=requested_tenant
  AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
  AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
 WHERE s.token_digest=digest AND s.environment='synthetic_demo'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;

-- The new owner has neither a runtime membership nor authority to issue bindings.
ALTER FUNCTION app.lp6_session_authority(text,text,uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.current_memberships(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_session_memberships(uuid,uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_required_state(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_session_scope(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_code_signin_allowed(uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION identity.sso_required_refusal_target(uuid,uuid) OWNER TO jobguard_session_lookup;
ALTER FUNCTION app.anonymous_practice_authority(text,uuid) OWNER TO jobguard_session_lookup;
GRANT EXECUTE ON FUNCTION app.lp6_session_authority(text,text,uuid), app.anonymous_practice_authority(text,uuid),
 identity.current_memberships(uuid),identity.sso_session_memberships(uuid,uuid),identity.sso_required_state(uuid),
 identity.sso_session_scope(uuid),identity.sso_code_signin_allowed(uuid),identity.sso_required_refusal_target(uuid,uuid)
 TO jobguard_migration;
GRANT EXECUTE ON FUNCTION app.current_tenant(),app.lp6e_request_binding_present() TO jobguard_session_lookup;
GRANT EXECUTE ON FUNCTION app.linked_practice_authority(text),app.authenticate_practice_session(text,uuid),app.contractor_member_active(uuid),
 app.lp6d_contractor_session_identity(uuid),app.contractor_practice_session_digest(uuid),
 app.contractor_practice_home_deadline(character,timestamptz) TO jobguard_session_lookup;
REVOKE CREATE ON SCHEMA app,identity,control_plane FROM jobguard_session_lookup;

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
  expression_using := regexp_replace(policy_row.predicate_using,
   tenant_setting_pattern, authority_expression, 'g');
  expression_check := regexp_replace(policy_row.predicate_check,
   tenant_setting_pattern, authority_expression, 'g');
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
ALTER POLICY migration_audit_integrity ON app.audit_event USING (
 CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant()
 ELSE pg_has_role(session_user,'jobguard_migration','SET') END
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
 id=nullif(current_setting('app.scim2_binding',true),'')::uuid
 AND CASE WHEN app.lp6e_request_binding_present() THEN tenant_id=app.current_tenant() ELSE true END
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

-- The ledger view was an owner-rights view. Preserve its security barrier and
-- use caller privileges/RLS, just like the existing parties/recovery views.
ALTER VIEW app.ledger_balance SET (security_invoker=true);
COMMIT;
