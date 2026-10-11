BEGIN;
-- ENT-10a: additive, synthetic identity/control-plane objects only. No existing DDL or grants change.
CREATE TABLE identity.sso_connection (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL UNIQUE,
 metadata jsonb NOT NULL CHECK(metadata->>'version'='sso-metadata.v1' AND metadata->>'protocol'='saml2' AND metadata->>'provider'='in-process-test-idp'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), CHECK(metadata->>'id'=id::text AND metadata->>'tenantId'=tenant_id::text)
);
CREATE TABLE identity.verified_domain (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, domain text NOT NULL UNIQUE CHECK(domain=lower(domain) AND domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+invalid$'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,connection_id,domain),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id)
);
CREATE TABLE identity.idp_group_role_mapping (
 tenant_id uuid NOT NULL, id uuid NOT NULL, connection_id uuid NOT NULL, idp_group text NOT NULL CHECK(length(idp_group) BETWEEN 1 AND 200),
 revision integer NOT NULL CHECK(revision>0), role text NOT NULL CHECK(role IN('admin','operative','supervisor','surveyor','commercial_manager','finance','read_only')),
 scope_kind text NOT NULL CHECK(scope_kind IN('tenant','region','branch','team')), scope_id uuid NOT NULL, enabled boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,connection_id,idp_group,revision),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id), CHECK(role<>'finance' OR scope_kind='tenant'), CHECK(scope_kind<>'tenant' OR scope_id=tenant_id)
);
CREATE TABLE identity.sso_request (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, request_id text NOT NULL, request_value text NOT NULL,
 state_digest char(64) NOT NULL CHECK(state_digest ~ '^[0-9a-f]{64}$'), link_session_id uuid REFERENCES identity.session(id),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,connection_id,request_id), FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id)
);
CREATE TABLE identity.sso_assertion_use (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, assertion_id text NOT NULL UNIQUE CHECK(length(assertion_id) BETWEEN 1 AND 200), request_id text NOT NULL,
 used_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,connection_id,assertion_id),
 FOREIGN KEY(tenant_id,connection_id,request_id) REFERENCES identity.sso_request(tenant_id,connection_id,request_id)
);
CREATE TABLE identity.sso_subject (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, subject_hash char(64) NOT NULL, email_hash char(64) NOT NULL,
 user_id uuid NOT NULL REFERENCES identity.identity_user(id), membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,connection_id,subject_hash), UNIQUE(tenant_id,connection_id,user_id),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id,user_id) REFERENCES app.membership(tenant_id,id,identity_user_id)
);
CREATE TABLE identity.sso_session_binding (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, subject_hash char(64) NOT NULL, session_id uuid NOT NULL UNIQUE REFERENCES identity.session(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,session_id),
 FOREIGN KEY(tenant_id,connection_id,subject_hash) REFERENCES identity.sso_subject(tenant_id,connection_id,subject_hash)
);
CREATE TABLE identity.sso_grant (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, subject_hash char(64) NOT NULL, grant_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,grant_id),
 FOREIGN KEY(tenant_id,connection_id,subject_hash) REFERENCES identity.sso_subject(tenant_id,connection_id,subject_hash),
 FOREIGN KEY(tenant_id,grant_id) REFERENCES app.role_grant(tenant_id,id)
);
-- Global identity exception: refusals whose route cannot resolve a tenant must still be recorded.
-- No address, raw assertion, token, supplied tenant or IP appears here.
CREATE TABLE identity.sso_refusal_event (
 id uuid PRIMARY KEY, route_hash char(64) NOT NULL CHECK(route_hash ~ '^[0-9a-f]{64}$'), code text NOT NULL CHECK(code ~ '^[A-Z_]{1,40}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['sso_connection','verified_domain','idp_group_role_mapping','sso_request','sso_assertion_use','sso_subject','sso_session_binding','sso_grant'] LOOP
  EXECUTE format('ALTER TABLE identity.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON identity.%I TO jobguard_identity,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity',n);
  EXECUTE format('GRANT SELECT ON identity.%I TO jobguard_identity',n);
  IF n<>'sso_request' THEN
   EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
  END IF;
 END LOOP;
END $$;
ALTER TABLE identity.sso_refusal_event OWNER TO jobguard_migration;
REVOKE ALL ON identity.sso_refusal_event FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
GRANT INSERT ON identity.sso_refusal_event TO jobguard_identity;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.sso_refusal_event FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
-- Narrow bootstrap exception. Only this connection UUID can be looked up before membership exists.
CREATE POLICY connection_lookup ON identity.sso_connection FOR SELECT TO jobguard_migration
 USING(id=nullif(current_setting('app.sso_connection_id',true),'')::uuid);
CREATE FUNCTION identity.sso_load_connection(c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result identity.sso_connection; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.sso_connection_id',c::text,true);
 SELECT * INTO result FROM identity.sso_connection WHERE id=c;
 PERFORM set_config('app.sso_connection_id','',true);
 IF result.id IS NULL THEN RAISE EXCEPTION 'SSO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM set_config('app.tenant_id',result.tenant_id::text,true);
 RETURN result.metadata;
END $$;
CREATE FUNCTION identity.sso_require_admin(s char(64),t uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; m uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO u FROM identity.session WHERE token_digest=s AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 SELECT id INTO m FROM app.membership WHERE tenant_id=t AND identity_user_id=u AND app.contractor_allowed(id,'organisation.manage',t) FOR SHARE;
 IF m IS NULL THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;
CREATE FUNCTION identity.sso_admin_command(s char(64),p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c uuid; revision integer; actor uuid; BEGIN
 -- Same tenant lock as ENT-1: admin/revocation/mapping/sign-in serialize before the audit head.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 actor:=identity.sso_require_admin(s,t);
 IF p->>'version'<>'sso-admin.v1' OR p->>'requested_tenant_id' IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 IF p->>'action'='connection.create' THEN
  IF p->'metadata'->>'tenantId' IS DISTINCT FROM t::text OR p->'metadata'->>'id' IS DISTINCT FROM p->>'id' THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES(t,(p->>'id')::uuid,p->'metadata'); RETURN actor;
 END IF;
 c:=(p->>'connectionId')::uuid;
 PERFORM 1 FROM identity.sso_connection WHERE tenant_id=t AND id=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'SSO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p->>'action'='domain.verify' THEN
  IF p->>'proof' IS DISTINCT FROM 'synthetic-domain:'||c::text||':'||(p->>'domain') THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
  INSERT INTO identity.verified_domain(tenant_id,connection_id,domain) VALUES(t,c,p->>'domain');
 ELSIF p->>'action'='mapping.set' THEN
  SELECT coalesce(max(x.revision),0) INTO revision FROM identity.idp_group_role_mapping x WHERE tenant_id=t AND connection_id=c AND idp_group=p->>'group';
  IF revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_MAPPING' USING ERRCODE='40001'; END IF;
  IF (p->'scope'->>'kind'='tenant' AND p->'scope'->>'id' IS DISTINCT FROM t::text)
   OR (p->'scope'->>'kind' IN('region','branch') AND NOT EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=(p->'scope'->>'id')::uuid AND kind=p->'scope'->>'kind'))
   OR (p->'scope'->>'kind'='team' AND NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=(p->'scope'->>'id')::uuid))
  THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO identity.idp_group_role_mapping(tenant_id,id,connection_id,idp_group,revision,role,scope_kind,scope_id,enabled)
   VALUES(t,gen_random_uuid(),c,p->>'group',revision+1,p->>'role',p->'scope'->>'kind',(p->'scope'->>'id')::uuid,(p->>'enabled')::boolean);
 ELSE RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION identity.sso_cache(c uuid,k text,v text,state char(64),link_session uuid,operation text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; result text; BEGIN
 PERFORM identity.sso_load_connection(c); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF operation='save' THEN
  INSERT INTO identity.sso_request(tenant_id,connection_id,request_id,request_value,state_digest,link_session_id,expires_at) VALUES(t,c,k,v,state,link_session,clock_timestamp()+interval '10 minutes'); RETURN v;
 ELSIF operation='get' THEN
  SELECT request_value INTO result FROM identity.sso_request WHERE tenant_id=t AND connection_id=c AND request_id=k AND expires_at>clock_timestamp() AND consumed_at IS NULL; RETURN result;
 ELSIF operation='remove' THEN
  UPDATE identity.sso_request SET consumed_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND request_id=k AND consumed_at IS NULL RETURNING request_value INTO result; RETURN result;
 ELSE RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
END $$;
-- The identity credential is the SAML validator trust boundary; business/worker roles cannot execute this routine.
CREATE FUNCTION identity.sso_complete(c uuid,claims jsonb,state char(64),new_session uuid,token char(64),csrf text,expires timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; r identity.sso_request; sub identity.sso_subject; u uuid; member uuid; account uuid; address text:=claims->>'email'; email_domain text; group_row record; grant_id uuid; grants_count integer:=0; sh char(64):=claims->>'subjectHash'; eh char(64):=claims->>'emailHash'; link identity.session; BEGIN
 PERFORM identity.sso_load_connection(c); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Match email-code serialization order and lock globally shared email before identity creation/linking.
 PERFORM pg_advisory_xact_lock(hashtextextended('identity-email:'||address,0));
 SELECT * INTO r FROM identity.sso_request WHERE tenant_id=t AND connection_id=c AND request_id=claims->>'requestId' FOR UPDATE;
 IF r.request_id IS NULL OR r.state_digest<>state OR r.expires_at<=clock_timestamp() OR r.consumed_at IS NULL THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 IF address IS NULL OR address<>lower(address) OR address NOT LIKE '%.invalid' OR length(address)>320 THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 email_domain:=split_part(address,'@',2);
 IF NOT EXISTS(SELECT 1 FROM identity.verified_domain WHERE tenant_id=t AND connection_id=c AND verified_domain.domain=email_domain) THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM identity.sso_assertion_use WHERE assertion_id=claims->>'assertionId') THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
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
 SELECT count(*) INTO grants_count FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'));
 IF sub.user_id IS NOT NULL THEN
  -- Revocation on a verified next sign-in is a committed fact even if no mapped group remains.
  UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id IN(SELECT session_id FROM identity.sso_session_binding WHERE tenant_id=t AND connection_id=c AND subject_hash=sh) AND revoked_at IS NULL;
  INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT t,gen_random_uuid(),g.grant_id FROM identity.sso_grant g
   WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id);
 END IF;
 IF grants_count=0 THEN
  INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,claims->>'assertionId',r.request_id);
  RETURN jsonb_build_object('code','NO_MAPPED_GRANTS');
 END IF;
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '15 minutes' THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 -- DB uniqueness is inside the same transaction as identity, membership, grants and session.
 INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,claims->>'assertionId',r.request_id);
 IF member IS NULL THEN
  u:=gen_random_uuid(); member:=gen_random_uuid();
  SELECT id INTO account FROM app.account WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(address,u);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,u,'read_only');
  INSERT INTO app.contractor_member VALUES(t,member,NULL,address);
  INSERT INTO identity.membership_locator VALUES(u,t,member);
 END IF;
 IF sub.user_id IS NULL THEN
  INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES(t,c,sh,eh,u,member);
 END IF;
 FOR group_row IN SELECT * FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups')) LOOP
  grant_id:=gen_random_uuid();
  INSERT INTO app.role_grant VALUES(t,grant_id,member,group_row.role,group_row.scope_kind,group_row.scope_id,NULL);
  INSERT INTO identity.sso_grant(tenant_id,connection_id,subject_hash,grant_id) VALUES(t,c,sh,grant_id);
 END LOOP;
 INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES(new_session,u,'synthetic_demo',token,csrf,expires);
 INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id) VALUES(t,c,sh,new_session);
 INSERT INTO identity.security_event(id,event_type,subject_id) VALUES(gen_random_uuid(),'session.issued',new_session);
 RETURN jsonb_build_object('userId',u,'membershipId',member,'tenantId',t);
END $$;
CREATE POLICY session_lookup ON identity.sso_session_binding FOR SELECT TO jobguard_migration
 USING(session_id=nullif(current_setting('app.sso_session_id',true),'')::uuid);
CREATE FUNCTION identity.sso_session_scope(s uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; binding record; BEGIN
 -- Session UUID is obtained only after opaque-token authentication, never a web selector.
 PERFORM set_config('app.sso_session_id',s::text,true);
 SELECT * INTO binding FROM identity.sso_session_binding WHERE session_id=s;
 PERFORM set_config('app.sso_session_id','',true);
 IF binding.session_id IS NOT NULL THEN PERFORM set_config('app.tenant_id',binding.tenant_id::text,true); END IF;
 IF binding.session_id IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('tenantId',b.tenant_id,'membershipId',sub.membership_id) INTO result FROM identity.sso_session_binding b
  JOIN identity.sso_subject sub ON(sub.tenant_id,sub.connection_id,sub.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash)
  WHERE b.session_id=s AND app.contractor_member_active(sub.membership_id)
  AND EXISTS(SELECT 1 FROM identity.session se WHERE se.id=s AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp() AND se.environment='synthetic_demo');
 RETURN coalesce(result,'{"revoked":true}'::jsonb);
END $$;
CREATE FUNCTION identity.sso_action_allowed(c uuid,s uuid,m uuid,permission text,target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 RETURN current_database()='jobguard_synthetic_demo' AND EXISTS(
  SELECT 1 FROM identity.sso_session_binding b JOIN identity.sso_subject sub ON(sub.tenant_id,sub.connection_id,sub.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash)
  JOIN identity.session se ON se.id=b.session_id
  WHERE b.tenant_id=t AND b.connection_id=c AND b.session_id=s AND sub.membership_id=m AND se.user_id=sub.user_id AND se.environment='synthetic_demo'
  AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp() AND app.contractor_allowed(m,permission,target));
END $$;
CREATE FUNCTION identity.sso_admin_events(s char(64),t uuid) RETURNS TABLE(id uuid,event_type varchar,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.sso_require_admin(s,t);
 RETURN QUERY SELECT a.id,a.event_type,a.occurred_at FROM app.audit_event a WHERE a.tenant_id=t AND a.event_type LIKE 'sso.%' ORDER BY a.sequence DESC LIMIT 100;
END $$;
-- Restricted audit bridge: no widening of existing audit grants. Caller hashes with packages/db's canonical contract.
CREATE FUNCTION identity.sso_audit_head(c uuid) RETURNS TABLE(tenant_id uuid,sequence bigint,previous_hash text,occurred_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.sso_load_connection(c);
 RETURN QUERY SELECT nullif(current_setting('app.tenant_id',true),'')::uuid,h.sequence+1,h.event_hash::text,date_trunc('milliseconds',clock_timestamp()) FROM app.lock_audit_head() h;
END $$;
CREATE FUNCTION identity.sso_audit_append(c uuid,e jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; BEGIN
 IF e->>'tenantId' IS DISTINCT FROM t::text OR e->>'subjectRef' IS DISTINCT FROM c::text OR e->>'eventType' NOT LIKE 'sso.%' OR e->>'version'<>'audit.v1'
  OR e->'payload'-ARRAY['references','hashes','classifications']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES((e->>'id')::uuid,t,(e->>'sequence')::bigint,'audit.v1',e->>'actorRef',e->>'eventType','sso-connection',c::text,(e->>'occurredAt')::timestamptz,e->'payload',e->>'payloadHash',e->>'previousHash',e->>'eventHash');
 PERFORM app.advance_audit_head((e->>'sequence')::bigint,(e->>'eventHash')::char(64));
END $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname LIKE 'sso_%' LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_identity',f);
 END LOOP;
END $$;
COMMIT;
