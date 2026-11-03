BEGIN;
-- Dark foundation: no existing route, bridge, command or RLS policy is changed.
-- The administrator provisions the owner. Only its automatic ADMIN-only
-- creator row and this migration's temporary ownership-transfer row are allowed.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_binding_owner') THEN
  RAISE EXCEPTION 'jobguard_binding_owner is missing; run administrative ensureRoles before migrations' USING ERRCODE='42704';
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_binding_owner'
  AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
  OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
   WHERE m.member='jobguard_binding_owner'::regrole OR
    (m.roleid='jobguard_binding_owner'::regrole AND NOT (
      (m.member=session_user::regrole AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND g.rolsuper)
      OR (m.member='jobguard_migration'::regrole AND current_user='jobguard_migration'
       AND NOT m.admin_option AND m.inherit_option AND m.set_option AND m.grantor=session_user::regrole))))
  OR EXISTS(SELECT FROM pg_roles r WHERE r.rolname ~ '^jobguard_(runtime|identity|infrastructure|worker.*)$'
   AND (pg_has_role(r.oid,'jobguard_binding_owner','USAGE') OR pg_has_role(r.oid,'jobguard_binding_owner','SET'))) THEN
  RAISE EXCEPTION 'jobguard_binding_owner has unsafe posture or membership' USING ERRCODE='42501';
 END IF;
END $$;
-- Temporary schema CREATE is required for ALTER OWNER, never retained.
GRANT CREATE ON SCHEMA app, control_plane TO jobguard_binding_owner;
GRANT USAGE ON SCHEMA app, identity, control_plane TO jobguard_binding_owner;
GRANT SELECT ON identity.session, control_plane.practice_session, control_plane.contractor_practice_session TO jobguard_binding_owner;
GRANT EXECUTE ON FUNCTION identity.sso_session_memberships(uuid,uuid) TO jobguard_binding_owner;

-- Private infrastructure exception, deliberately not tenant RLS: indexing the
-- current transaction must not depend on the tenant it is establishing.
CREATE UNLOGGED TABLE control_plane.request_binding (
 environment_id text NOT NULL,
 transaction_id xid8 NOT NULL,
 credential_kind text NOT NULL CHECK(credential_kind IN ('real','practice','contractor_practice')),
 session_ref text NOT NULL,
 tenant_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(environment_id,transaction_id)
);
ALTER TABLE control_plane.request_binding OWNER TO jobguard_binding_owner;
REVOKE ALL ON control_plane.request_binding FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_migration;

-- Row locking requires UPDATE privilege in PostgreSQL. Keep that capability
-- with the existing session owner, behind this credential-scoped private helper;
-- do not grant UPDATE or general membership access to the new binding owner.
CREATE FUNCTION app.lp6_session_authority(p_kind text,p_credential text,p_tenant uuid)
 RETURNS TABLE(session_ref text,actor_id uuid,expires_at timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE real_session identity.session; home control_plane.practice_session;
 practice control_plane.contractor_practice_session; selected_actor uuid;
 selected_ref text; deadline timestamptz; saved_tenant text:=current_setting('app.tenant_id',true);
 saved_sso text:=current_setting('app.sso_session_id',true);
BEGIN
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
  PERFORM set_config('app.tenant_id',p_tenant::text,true);
  SELECT m.id INTO selected_actor FROM app.membership m
   WHERE (m.tenant_id,m.id,m.identity_user_id)=(p_tenant,practice.membership_id,practice.identity_user_id)
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
  selected_ref:=practice.session_id::text;
 ELSE
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF selected_actor IS NULL OR deadline IS NULL OR deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN QUERY SELECT selected_ref,selected_actor,deadline;
END $$;
ALTER FUNCTION app.lp6_session_authority(text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6_session_authority(text,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6_session_authority(text,text,uuid) TO jobguard_binding_owner;

CREATE FUNCTION app.bind_request(p_kind text,p_credential text,p_tenant uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE authority record; previous control_plane.request_binding;
 environment_key text:=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database()); request_xid xid8:=pg_current_xact_id();
BEGIN
 SELECT * INTO authority FROM app.lp6_session_authority(p_kind,p_credential,p_tenant);
 SELECT * INTO previous FROM control_plane.request_binding b
  WHERE b.environment_id=environment_key AND b.transaction_id=request_xid;
 IF FOUND THEN
  IF (previous.credential_kind,previous.session_ref,previous.tenant_id,previous.actor_id)
   IS DISTINCT FROM (p_kind,authority.session_ref,p_tenant,authority.actor_id) THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  RETURN;
 END IF;
 INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at)
  VALUES(environment_key,request_xid,p_kind,authority.session_ref,p_tenant,authority.actor_id,authority.expires_at);
END $$;
ALTER FUNCTION app.bind_request(text,text,uuid) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.bind_request(text,text,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.bind_request(text,text,uuid) TO jobguard_runtime;

CREATE FUNCTION app.lp6_bound_request() RETURNS control_plane.request_binding
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE bound control_plane.request_binding;
BEGIN
 SELECT * INTO bound FROM control_plane.request_binding b
  WHERE b.environment_id=(extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database())) AND b.transaction_id=pg_current_xact_id_if_assigned();
 IF NOT FOUND OR bound.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 RETURN bound;
END $$;
ALTER FUNCTION app.lp6_bound_request() OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp6_bound_request() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE FUNCTION app.current_actor() RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT (app.lp6_bound_request()).actor_id
$$;
CREATE FUNCTION app.current_tenant() RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT (app.lp6_bound_request()).tenant_id
$$;
ALTER FUNCTION app.current_actor() OWNER TO jobguard_binding_owner;
ALTER FUNCTION app.current_tenant() OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.current_actor(),app.current_tenant() FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_runtime;
REVOKE CREATE ON SCHEMA app, control_plane FROM jobguard_binding_owner;
COMMIT;
