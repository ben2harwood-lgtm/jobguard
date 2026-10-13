BEGIN;
-- ENT-10e: one-step company-owner approval, immutable windows and clock-based gates.
ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held;
INSERT INTO identity.sso_emergency_approver_rule(id,version,definition)
 VALUES('14300000-0000-4000-8000-000000000001'::uuid,'company-owner-only.v1','{"approver":"company_owner"}'::jsonb);
ALTER TABLE identity.sso_emergency_approver_rule ADD CONSTRAINT sso_emergency_approver_rule_owner_only
 CHECK(id='14300000-0000-4000-8000-000000000001'::uuid AND version='company-owner-only.v1' AND definition='{"approver":"company_owner"}'::jsonb);
CREATE TABLE identity.sso_emergency_window (
 tenant_id uuid NOT NULL, approval_id uuid NOT NULL, event_id uuid NOT NULL,
 command_id uuid NOT NULL, owner_membership_id uuid NOT NULL,
 window_minutes integer NOT NULL, opened_at timestamptz NOT NULL, closes_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,approval_id), UNIQUE(tenant_id,event_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,approval_id) REFERENCES identity.sso_emergency_use(tenant_id,approval_id),
 FOREIGN KEY(tenant_id,event_id) REFERENCES identity.sso_required_event(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(window_minutes BETWEEN 15 AND 240),
 CHECK(closes_at=opened_at+make_interval(mins=>window_minutes))
);
ALTER TABLE identity.sso_emergency_window OWNER TO jobguard_migration;
ALTER TABLE identity.sso_emergency_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.sso_emergency_window FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.sso_emergency_window TO jobguard_identity,jobguard_migration
 USING(tenant_id=(CASE WHEN current_setting('app.tenant_id',true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN current_setting('app.tenant_id',true)::uuid ELSE NULL END))
 WITH CHECK(tenant_id=(CASE WHEN current_setting('app.tenant_id',true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN current_setting('app.tenant_id',true)::uuid ELSE NULL END));
REVOKE ALL ON identity.sso_emergency_window FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
GRANT SELECT ON identity.sso_emergency_window TO jobguard_identity;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.sso_emergency_window
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

CREATE FUNCTION identity.sso_required_state(t uuid)
 RETURNS TABLE(required boolean,connection_id uuid,revision integer,event_id uuid,actor_kind text,
 window_opened_at timestamptz,window_closes_at timestamptz,window_minutes integer,window_open boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE latest identity.sso_required_event; window_row identity.sso_emergency_window; is_open boolean:=false; BEGIN
 IF t IS NULL OR current_setting('app.tenant_id',true) IS DISTINCT FROM t::text
 THEN RAISE EXCEPTION 'SSO_REQUIRED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO latest FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
 IF latest.actor_kind='emergency' THEN
  SELECT * INTO window_row FROM identity.sso_emergency_window w WHERE w.tenant_id=t AND w.event_id=latest.id;
  is_open:=coalesce(clock_timestamp()<window_row.closes_at,false);
 END IF;
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
 PERFORM set_config('app.tenant_id','',true);
 PERFORM set_config('app.sso_session_id',coalesce(s::text,''),true);
 SELECT * INTO binding FROM identity.sso_session_binding b WHERE b.session_id=s;
 PERFORM set_config('app.sso_session_id','',true);
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  PERFORM set_config('app.tenant_id',member.tenant_id::text,true);
  SELECT coalesce(bool_or(e.required),true) INTO needed FROM identity.sso_required_state(member.tenant_id) e;
  IF coalesce(needed,false)=false OR (binding.session_id=s AND binding.tenant_id=member.tenant_id AND EXISTS(
   SELECT 1 FROM identity.sso_subject sub
    WHERE (sub.tenant_id,sub.connection_id,sub.subject_hash)=(binding.tenant_id,binding.connection_id,binding.subject_hash)
     AND sub.user_id=u AND sub.membership_id=member.id))
  THEN RETURN QUERY SELECT member.id,member.identity_user_id,member.tenant_id,member.role,member.email,member.name; END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_code_signin_allowed(u uuid)
 RETURNS TABLE(allowed boolean,connections uuid[]) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; needed boolean; c uuid; active_count integer:=0; ordinary_count integer:=0; targets uuid[]:='{}'; BEGIN
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  active_count:=active_count+1; PERFORM set_config('app.tenant_id',member.tenant_id::text,true);
  SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(member.tenant_id) e;
  IF coalesce(needed,false) THEN targets:=array_append(targets,c); ELSE ordinary_count:=ordinary_count+1; END IF;
 END LOOP;
 RETURN QUERY SELECT active_count=0 OR ordinary_count>0,targets;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_invitation_accept_allowed(invitation uuid)
 RETURNS TABLE(allowed boolean,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; needed boolean; c uuid; BEGIN
 SELECT i.tenant_id INTO t FROM identity.invitation i WHERE i.id=invitation;
 IF t IS NULL THEN RETURN QUERY SELECT true,NULL::uuid; RETURN; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(t) e;
 RETURN QUERY SELECT NOT coalesce(needed,false),(CASE WHEN needed THEN c ELSE NULL::uuid END);
END $$;

CREATE OR REPLACE FUNCTION identity.sso_invite_member(session_digest char(64),t uuid,recipient varchar,assigned_role varchar)
 RETURNS TABLE(id uuid,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE needed boolean; c uuid; BEGIN
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT coalesce(bool_or(e.required),true),(array_agg(e.connection_id))[1] INTO needed,c FROM identity.sso_required_state(t) e;
 IF coalesce(needed,false) THEN RETURN QUERY SELECT NULL::uuid,c; RETURN; END IF;
 RETURN QUERY SELECT identity.invite_member(session_digest,t,recipient,assigned_role),NULL::uuid;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_required_refusal_target(u uuid,t uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; c uuid; BEGIN
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  IF member.tenant_id=t THEN
   PERFORM set_config('app.tenant_id',t::text,true);
   SELECT e.connection_id INTO c FROM identity.sso_required_state(t) e WHERE e.required IS NOT FALSE;
   RETURN c;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION identity.sso_required_view(s char(64),t uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event identity.sso_required_event; unlinked integer; c uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM identity.sso_require_admin(s,t);
 SELECT t,(array_agg(e.event_id))[1],coalesce(max(e.revision),0),coalesce(bool_or(e.required),true),
  (array_agg(e.connection_id))[1],NULL::uuid,(array_agg(e.actor_kind))[1],NULL::text,NULL::timestamptz
  INTO event FROM identity.sso_required_state(t) e;
 SELECT count(*)::integer INTO unlinked FROM identity.membership_locator l JOIN app.membership m
  ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
  WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id);
 SELECT co.id INTO c FROM identity.sso_connection co WHERE co.tenant_id=t ORDER BY co.created_at,co.id LIMIT 1;
 RETURN jsonb_build_object('auditConnectionId',coalesce(event.connection_id,c),'version','sso-required-state.v1','environment','synthetic_demo','tenantId',t,'required',coalesce(event.required,false),'revision',coalesce(event.revision,0),'unlinkedMembers',unlinked);
END $$;
CREATE OR REPLACE FUNCTION identity.sso_emergency_use(u uuid,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; member record; actor uuid; owner_role text; event record; approval identity.sso_emergency_approval;
 rule uuid; command uuid; minutes integer; now_ts timestamptz;
 cause text:='EMERGENCY_REFUSED'; result jsonb; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN jsonb_build_object('used',false,'cause','SSO_ROUTE_BLOCKED'); END IF;
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
  IF member.tenant_id=t THEN actor:=member.id; owner_role:=member.role; END IF;
 END LOOP;
 IF actor IS NULL THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_MEMBER_NOT_ACTIVE'); END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Recheck under the tenant lock, using the existing permission/active-member contract.
 IF (app.contractor_allowed(actor,'organisation.manage',t)) IS NOT TRUE THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_PERMISSION_REFUSED'); END IF;
 SELECT * INTO event FROM identity.sso_required_state(t);
 IF event.required IS FALSE THEN
  -- A competing use sees the committed OFF revision under the same tenant lock.
  IF event.actor_kind='emergency' AND event.window_open IS TRUE AND EXISTS(SELECT 1 FROM identity.sso_emergency_use used JOIN identity.sso_emergency_approval a
    ON(a.tenant_id,a.id)=(used.tenant_id,used.approval_id)
    WHERE used.tenant_id=t AND used.event_id=event.event_id AND a.membership_id=actor) THEN
   INSERT INTO identity.sso_emergency_event(tenant_id,id,membership_id,outcome,cause_code,reason)
    VALUES(t,gen_random_uuid(),actor,'refused','EMERGENCY_ALREADY_USED',p->>'reason');
   RETURN jsonb_build_object('used',false,'cause','EMERGENCY_ALREADY_USED','connectionId',event.connection_id,'actorMembershipId',actor);
  END IF;
  RETURN jsonb_build_object('used',false,'cause','EMERGENCY_SWITCH_OFF');
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
 RETURN jsonb_build_object('used',result IS NOT NULL,'cause',cause,'connectionId',event.connection_id,'actorMembershipId',actor)
  ||(CASE WHEN result IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('eventId',result->>'eventId','windowMinutes',minutes,
   'closesAt',to_char((now_ts+make_interval(mins=>minutes)) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) END);
END $$;

CREATE FUNCTION identity.sso_required_detail(s char(64),t uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state record; total integer; members jsonb; invitations jsonb; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM identity.sso_require_admin(s,t);
 SELECT * INTO state FROM identity.sso_required_state(t);
 SELECT count(*)::integer INTO total FROM identity.membership_locator l JOIN app.membership m
  ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
  WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',r.membership_id,'email',r.email,'role',r.role,'kind',r.kind) ORDER BY r.email,r.membership_id),'[]'::jsonb)
 INTO members FROM (
  SELECT l.membership_id,e.email,m.role,(CASE WHEN EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id)
   THEN 'linked_to_earlier_membership' ELSE 'never_linked' END) kind
  FROM identity.membership_locator l JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
  JOIN identity.user_email e ON e.user_id=l.user_id
  WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id)
  ORDER BY e.email,l.membership_id LIMIT 200
 ) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('invitationId',r.id,'email',r.email,'role',r.role,
  'expiresAt',to_char(r.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY r.email,r.id),'[]'::jsonb)
 INTO invitations FROM (SELECT i.id,i.email,i.role,i.expires_at FROM identity.invitation i
  WHERE i.tenant_id=t AND i.accepted_at IS NULL AND i.expires_at>clock_timestamp() ORDER BY i.email,i.id LIMIT 200) r;
 RETURN jsonb_build_object('version','sso-required-detail.v1','environment','synthetic_demo','tenantId',t,
  'required',coalesce(state.required,true),'revision',coalesce(state.revision,0),
  'emergencyWindow',(CASE WHEN state.actor_kind='emergency' THEN jsonb_build_object(
   'openedAt',to_char(state.window_opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'closesAt',to_char(state.window_closes_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'windowMinutes',state.window_minutes,'open',coalesce(state.window_open,false)) ELSE NULL END),
  'unlinked',jsonb_build_object('total',total,'truncated',total>200,'members',members),'pendingInvitations',invitations);
END $$;
ALTER FUNCTION identity.sso_required_state(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.sso_required_state(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
ALTER FUNCTION identity.sso_required_detail(character,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.sso_required_detail(character,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
GRANT EXECUTE ON FUNCTION identity.sso_required_detail(character,uuid) TO jobguard_identity;
COMMIT;
