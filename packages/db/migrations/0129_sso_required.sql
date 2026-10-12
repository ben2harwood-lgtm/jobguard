BEGIN;
-- ENT-10d: new identity/control-plane objects only. Default OFF preserves merged behavior.
CREATE TABLE identity.sso_required_event (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), required boolean NOT NULL,
 connection_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_kind text NOT NULL CHECK(actor_kind IN('admin','emergency')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,revision),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(actor_kind<>'emergency' OR NOT required)
);
-- HELD for Ben. No configuration or approval writer is shipped. Even the owner cannot seed a rule
-- without explicitly lifting this constraint in a separately reviewed migration (or rolled-back fixture).
CREATE TABLE identity.sso_emergency_approver_rule (
 id uuid PRIMARY KEY, version text NOT NULL, definition jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT sso_emergency_approver_rule_held CHECK(false)
);
CREATE TABLE identity.sso_emergency_approval (
 tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL,
 rule_id uuid NOT NULL REFERENCES identity.sso_emergency_approver_rule(id),
 approver_ref text NOT NULL CHECK(length(approver_ref) BETWEEN 1 AND 200),
 reason_hash char(64) NOT NULL CHECK(reason_hash ~ '^[0-9a-f]{64}$'),
 approved_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(expires_at>approved_at AND expires_at<=approved_at+interval '30 minutes')
);
CREATE TABLE identity.sso_emergency_use (
 tenant_id uuid NOT NULL, approval_id uuid NOT NULL, event_id uuid NOT NULL,
 used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,approval_id), UNIQUE(tenant_id,event_id),
 FOREIGN KEY(tenant_id,approval_id) REFERENCES identity.sso_emergency_approval(tenant_id,id),
 FOREIGN KEY(tenant_id,event_id) REFERENCES identity.sso_required_event(tenant_id,id)
);
CREATE TABLE identity.sso_emergency_event (
 tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('refused','used')),
 cause_code text NOT NULL CHECK(cause_code ~ '^[A-Z_]{1,40}$'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['sso_required_event','sso_emergency_approval','sso_emergency_use','sso_emergency_event'] LOOP
  EXECUTE format('ALTER TABLE identity.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',n);
  -- Same transaction-local tenant shape as 0120, with invalid settings failing closed without a cast error.
  EXECUTE format('CREATE POLICY tenant_isolation ON identity.%I TO jobguard_identity,jobguard_migration USING(tenant_id=(CASE WHEN current_setting(''app.tenant_id'',true) ~ ''^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'' THEN current_setting(''app.tenant_id'',true)::uuid ELSE NULL END)) WITH CHECK(tenant_id=(CASE WHEN current_setting(''app.tenant_id'',true) ~ ''^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'' THEN current_setting(''app.tenant_id'',true)::uuid ELSE NULL END))',n);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity',n);
  EXECUTE format('GRANT SELECT ON identity.%I TO jobguard_identity',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
 END LOOP;
END $$;
ALTER TABLE identity.sso_emergency_approver_rule OWNER TO jobguard_migration;
REVOKE ALL ON identity.sso_emergency_approver_rule FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.sso_emergency_approver_rule FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- Access gates run in EVERY database, take no tenant lock and compare no session time.
-- current_memberships owns the existing active-member test. The provider retains its second binding filter.
CREATE FUNCTION identity.sso_session_memberships(u uuid,s uuid)
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
  SELECT e.required INTO needed FROM identity.sso_required_event e WHERE e.tenant_id=member.tenant_id ORDER BY e.revision DESC LIMIT 1;
  IF coalesce(needed,false)=false OR (binding.session_id=s AND binding.tenant_id=member.tenant_id AND EXISTS(
   SELECT 1 FROM identity.sso_subject sub
    WHERE (sub.tenant_id,sub.connection_id,sub.subject_hash)=(binding.tenant_id,binding.connection_id,binding.subject_hash)
     AND sub.user_id=u AND sub.membership_id=member.id))
  THEN RETURN QUERY SELECT member.id,member.identity_user_id,member.tenant_id,member.role,member.email,member.name; END IF;
 END LOOP;
END $$;
CREATE FUNCTION identity.sso_code_signin_allowed(u uuid)
 RETURNS TABLE(allowed boolean,connections uuid[]) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; needed boolean; c uuid; active_count integer:=0; ordinary_count integer:=0; targets uuid[]:='{}'; BEGIN
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  active_count:=active_count+1; PERFORM set_config('app.tenant_id',member.tenant_id::text,true);
  SELECT e.required,e.connection_id INTO needed,c FROM identity.sso_required_event e WHERE e.tenant_id=member.tenant_id ORDER BY e.revision DESC LIMIT 1;
  IF coalesce(needed,false) THEN targets:=array_append(targets,c); ELSE ordinary_count:=ordinary_count+1; END IF;
 END LOOP;
 RETURN QUERY SELECT active_count=0 OR ordinary_count>0,targets;
END $$;
CREATE FUNCTION identity.sso_invitation_accept_allowed(invitation uuid)
 RETURNS TABLE(allowed boolean,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; needed boolean; c uuid; BEGIN
 SELECT i.tenant_id INTO t FROM identity.invitation i WHERE i.id=invitation;
 IF t IS NULL THEN RETURN QUERY SELECT true,NULL::uuid; RETURN; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT e.required,e.connection_id INTO needed,c FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
 RETURN QUERY SELECT NOT coalesce(needed,false),(CASE WHEN needed THEN c ELSE NULL::uuid END);
END $$;
CREATE FUNCTION identity.sso_invite_member(session_digest char(64),t uuid,recipient varchar,assigned_role varchar)
 RETURNS TABLE(id uuid,connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE needed boolean; c uuid; BEGIN
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT e.required,e.connection_id INTO needed,c FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
 IF coalesce(needed,false) THEN RETURN QUERY SELECT NULL::uuid,c; RETURN; END IF;
 RETURN QUERY SELECT identity.invite_member(session_digest,t,recipient,assigned_role),NULL::uuid;
END $$;
CREATE FUNCTION identity.sso_required_refusal_target(u uuid,t uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member record; c uuid; BEGIN
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  IF member.tenant_id=t THEN
   PERFORM set_config('app.tenant_id',t::text,true);
   SELECT e.connection_id INTO c FROM identity.sso_required_event e WHERE e.tenant_id=t AND
    e.revision=(SELECT max(x.revision) FROM identity.sso_required_event x WHERE x.tenant_id=t) AND e.required;
   RETURN c;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
-- Private shared append primitive: deliberately NOT executable by the identity credential.
-- Only the two checked entrypoints below can reach it. Their tenant lock precedes all audit locks.
CREATE FUNCTION identity.sso_required_append(t uuid,c uuid,actor uuid,kind text,needed boolean,reason text,expected integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE revision integer; event uuid:=gen_random_uuid(); BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR kind NOT IN('admin','emergency') OR (kind='emergency' AND needed) THEN RAISE EXCEPTION 'SSO_REQUIRED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(max(e.revision),0) INTO revision FROM identity.sso_required_event e WHERE e.tenant_id=t;
 IF expected IS NULL OR revision<>expected THEN RAISE EXCEPTION 'STALE_SSO_REQUIRED' USING ERRCODE='40001'; END IF;
 INSERT INTO identity.sso_required_event(tenant_id,id,revision,required,connection_id,actor_membership_id,actor_kind,reason)
  VALUES(t,event,revision+1,needed,c,actor,kind,reason);
 RETURN jsonb_build_object('connectionId',c,'actorMembershipId',actor,'eventId',event,'revision',revision+1,'required',needed);
END $$;
CREATE FUNCTION identity.sso_required_command(s char(64),p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; c uuid; scope jsonb; candidate uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 actor:=identity.sso_require_admin(s,t);
 IF (p->>'version') IS DISTINCT FROM 'sso-required-command.v1' OR (p->>'requested_tenant_id') IS DISTINCT FROM t::text
  OR jsonb_typeof(p->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number'
  OR (p->>'expectedRevision') !~ '^[0-9]+$' OR length(coalesce(p->>'reason','')) NOT BETWEEN 20 AND 500
  OR (p-ARRAY['version','requested_tenant_id','required','expectedRevision','reason'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'INVALID_SSO_REQUIRED_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'required')::boolean THEN
  SELECT co.id INTO candidate FROM identity.sso_connection co WHERE co.tenant_id=t
   AND EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=co.id)
   AND EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(g.idp_group) g.enabled FROM identity.idp_group_role_mapping g WHERE g.tenant_id=t AND g.connection_id=co.id ORDER BY g.idp_group,g.revision DESC) latest WHERE latest.enabled)
   ORDER BY co.created_at,co.id LIMIT 1;
  IF candidate IS NULL THEN RAISE EXCEPTION 'SSO_REQUIRED_NO_CONNECTION' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT identity.sso_session_scope(se.id) INTO scope FROM identity.session se WHERE se.token_digest=s;
 IF scope IS NULL OR (scope->>'revoked')='true' OR (scope->>'tenantId') IS DISTINCT FROM t::text OR (scope->>'membershipId') IS DISTINCT FROM actor::text
 THEN RAISE EXCEPTION 'SSO_REQUIRED_NEEDS_SSO_SESSION' USING ERRCODE='42501'; END IF;
 c:=(scope->>'connectionId')::uuid;
 IF c IS NULL THEN RAISE EXCEPTION 'SSO_REQUIRED_NEEDS_SSO_SESSION' USING ERRCODE='42501'; END IF;
 IF (p->>'required')::boolean THEN
  -- The connection supporting this revision is the administrator's live binding, never caller input.
  IF NOT EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=c)
   OR NOT EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(g.idp_group) g.enabled FROM identity.idp_group_role_mapping g WHERE g.tenant_id=t AND g.connection_id=c ORDER BY g.idp_group,g.revision DESC) latest WHERE latest.enabled)
  THEN RAISE EXCEPTION 'SSO_REQUIRED_NO_CONNECTION' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM identity.membership_locator l JOIN app.membership m
    ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
    WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id))
  THEN RAISE EXCEPTION 'SSO_REQUIRED_UNLINKED_MEMBERS' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN identity.sso_required_append(t,c,actor,'admin',(p->>'required')::boolean,p->>'reason',(p->>'expectedRevision')::integer);
END $$;
CREATE FUNCTION identity.sso_required_view(s char(64),t uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event identity.sso_required_event; unlinked integer; c uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM identity.sso_require_admin(s,t);
 SELECT * INTO event FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
 SELECT count(*)::integer INTO unlinked FROM identity.membership_locator l JOIN app.membership m
  ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
  WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id);
 SELECT co.id INTO c FROM identity.sso_connection co WHERE co.tenant_id=t ORDER BY co.created_at,co.id LIMIT 1;
 RETURN jsonb_build_object('auditConnectionId',coalesce(event.connection_id,c),'version','sso-required-state.v1','environment','synthetic_demo','tenantId',t,'required',coalesce(event.required,false),'revision',coalesce(event.revision,0),'unlinkedMembers',unlinked);
END $$;
CREATE FUNCTION identity.sso_emergency_use(u uuid,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; member record; actor uuid; event identity.sso_required_event; approval identity.sso_emergency_approval;
 cause text:='EMERGENCY_REFUSED'; result jsonb; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN jsonb_build_object('used',false,'cause','SSO_ROUTE_BLOCKED'); END IF;
 IF (p->>'version') IS DISTINCT FROM 'sso-emergency.v1' OR (p->>'requested_tenant_id') IS NULL
  OR length(coalesce(p->>'reason','')) NOT BETWEEN 20 AND 500 OR (p-ARRAY['version','requested_tenant_id','email','code','reason'])<>'{}'::jsonb
 THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_INPUT_INVALID'); END IF;
 t:=(p->>'requested_tenant_id')::uuid;
 -- Authentication proved mailbox control before calling. Derive membership through the merged routine;
 -- an untrusted tenant UUID alone never grants authority to append a company's audit or emergency log.
 FOR member IN SELECT * FROM identity.current_memberships(u) LOOP
  IF member.tenant_id=t THEN actor:=member.id; END IF;
 END LOOP;
 IF actor IS NULL THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_MEMBER_NOT_ACTIVE'); END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Recheck under the tenant lock, using the existing permission/active-member contract.
 IF (app.contractor_allowed(actor,'organisation.manage',t)) IS NOT TRUE THEN RETURN jsonb_build_object('used',false,'cause','EMERGENCY_PERMISSION_REFUSED'); END IF;
 SELECT * INTO event FROM identity.sso_required_event e WHERE e.tenant_id=t ORDER BY e.revision DESC LIMIT 1;
 IF event.id IS NULL OR event.required IS NOT TRUE THEN
  -- A competing use sees the committed OFF revision under the same tenant lock.
  IF EXISTS(SELECT 1 FROM identity.sso_emergency_use used JOIN identity.sso_emergency_approval a
    ON(a.tenant_id,a.id)=(used.tenant_id,used.approval_id)
    WHERE used.tenant_id=t AND used.event_id=event.id AND a.membership_id=actor) THEN
   INSERT INTO identity.sso_emergency_event(tenant_id,id,membership_id,outcome,cause_code,reason)
    VALUES(t,gen_random_uuid(),actor,'refused','EMERGENCY_ALREADY_USED',p->>'reason');
   RETURN jsonb_build_object('used',false,'cause','EMERGENCY_ALREADY_USED','connectionId',event.connection_id,'actorMembershipId',actor);
  END IF;
  RETURN jsonb_build_object('used',false,'cause','EMERGENCY_SWITCH_OFF');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.sso_emergency_approver_rule) THEN cause:='EMERGENCY_APPROVER_RULE_UNSET';
 ELSE
  SELECT * INTO approval FROM identity.sso_emergency_approval a
   WHERE a.tenant_id=t AND a.membership_id=actor AND a.approved_at<=clock_timestamp()
    AND a.approved_at>=clock_timestamp()-interval '30 minutes' AND a.expires_at>clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM identity.sso_emergency_use used WHERE used.tenant_id=t AND used.approval_id=a.id)
   ORDER BY a.approved_at DESC,a.id LIMIT 1;
  IF approval.id IS NULL THEN cause:='EMERGENCY_APPROVAL_REQUIRED';
  ELSE
   result:=identity.sso_required_append(t,event.connection_id,actor,'emergency',false,p->>'reason',event.revision);
   INSERT INTO identity.sso_emergency_use(tenant_id,approval_id,event_id) VALUES(t,approval.id,(result->>'eventId')::uuid);
   cause:='EMERGENCY_USED';
  END IF;
 END IF;
 INSERT INTO identity.sso_emergency_event(tenant_id,id,membership_id,outcome,cause_code,reason)
  VALUES(t,gen_random_uuid(),actor,(CASE WHEN result IS NULL THEN 'refused' ELSE 'used' END),cause,p->>'reason');
 RETURN jsonb_build_object('used',result IS NOT NULL,'cause',cause,'connectionId',event.connection_id,'actorMembershipId',actor);
END $$;
-- Explicit list: no pattern can re-touch any 0120 object. The append helper is private.
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY[
  'identity.sso_session_memberships(uuid,uuid)',
  'identity.sso_code_signin_allowed(uuid)',
  'identity.sso_invitation_accept_allowed(uuid)',
  'identity.sso_invite_member(character,uuid,character varying,character varying)',
  'identity.sso_required_refusal_target(uuid,uuid)',
  'identity.sso_required_command(character,jsonb)',
  'identity.sso_required_view(character,uuid)',
  'identity.sso_emergency_use(uuid,jsonb)'
 ] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_identity',f);
 END LOOP;
END $$;
ALTER FUNCTION identity.sso_required_append(uuid,uuid,uuid,text,boolean,text,integer) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.sso_required_append(uuid,uuid,uuid,text,boolean,text,integer) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
COMMIT;
