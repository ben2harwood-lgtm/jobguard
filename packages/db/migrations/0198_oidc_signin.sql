BEGIN;
-- Existing SAML rows and their immutable metadata remain unchanged.
ALTER TABLE identity.sso_connection DROP CONSTRAINT sso_connection_metadata_check;
ALTER TABLE identity.sso_connection DROP CONSTRAINT sso_connection_check;
ALTER TABLE identity.sso_connection ADD CONSTRAINT sso_connection_metadata_check CHECK ((
 ((metadata->>'version')='sso-metadata.v1' AND (metadata->>'protocol')='saml2' AND (metadata->>'provider')='in-process-test-idp' AND (metadata->>'id')=id::text AND (metadata->>'tenantId')=tenant_id::text)
 OR ((metadata->>'version')='oidc-connection.v1' AND (metadata->>'protocol')='oidc' AND metadata->>'revision'='1'
 AND metadata->'config'->>'version'='oidc-config.v1' AND metadata->'config'->>'mode'='synthetic_demo' AND metadata->'config'->>'provider'='in-process-test-idp'
 AND metadata->'config'->>'connectionId'=id::text AND metadata->'config'->>'tenantId'=tenant_id::text
 AND metadata->'config'->>'issuer'='https://issuer.invalid' AND metadata->'config'->>'clientId'='jobguard-practice'
 AND metadata->'config'->>'redirectUri'='https://app.invalid/oidc/callback' AND (metadata->>'sessionLimitSeconds')::integer BETWEEN 60 AND 900)
) IS TRUE);
-- Preserve the existing SAML view's shape: only its owner-side bootstrap routines see OIDC metadata.
-- This adds a restrictive policy; existing tenant isolation and SAML visibility are unchanged.
CREATE POLICY oidc_hide_from_saml_view ON identity.sso_connection AS RESTRICTIVE FOR SELECT TO jobguard_identity USING(metadata->>'protocol'='saml2');
-- Connections are immutable and single protocol; OIDC replay IDs include connection and random state.
CREATE TABLE identity.oidc_request (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, state text NOT NULL CHECK(state ~ '^[A-Za-z0-9_-]{43}$'),
 request jsonb NOT NULL, configuration jsonb NOT NULL, link_session_id uuid REFERENCES identity.session(id),
 link_user_id uuid REFERENCES identity.identity_user(id), link_digest char(64), link_csrf text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','claimed','outcome_unknown','completed','refused')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 claimed_at timestamptz, finished_at timestamptz,
 PRIMARY KEY(tenant_id,connection_id,state), FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id),
 CHECK((link_session_id IS NULL AND link_user_id IS NULL AND link_digest IS NULL AND link_csrf IS NULL) OR
 (link_session_id IS NOT NULL AND link_user_id IS NOT NULL AND link_digest IS NOT NULL AND link_csrf IS NOT NULL))
);
ALTER TABLE identity.oidc_request OWNER TO jobguard_migration;
ALTER TABLE identity.oidc_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.oidc_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.oidc_request TO jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON identity.oidc_request FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure;

-- Separate replay namespace preserves existing SAML raw assertion records and uniqueness unchanged.
CREATE TABLE identity.oidc_assertion_use (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, assertion_id text NOT NULL, request_id text NOT NULL,
 used_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,connection_id,assertion_id),
 UNIQUE(tenant_id,connection_id,request_id),
 FOREIGN KEY(tenant_id,connection_id,request_id) REFERENCES identity.sso_request(tenant_id,connection_id,request_id)
);
ALTER TABLE identity.oidc_assertion_use OWNER TO jobguard_migration;
ALTER TABLE identity.oidc_assertion_use ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.oidc_assertion_use FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.oidc_assertion_use TO jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON identity.oidc_assertion_use FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.oidc_assertion_use FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

CREATE FUNCTION identity.oidc_create(s char(64),p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c uuid:=(p->'config'->>'connectionId')::uuid; current_session identity.session; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM identity.sso_require_admin(s,t);
 SELECT * INTO current_session FROM identity.session WHERE token_digest=s AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF current_session.id IS NULL THEN RAISE EXCEPTION 'SSO_FORBIDDEN'; END IF;
 PERFORM identity.oidc_link(t,current_session.id,current_session.user_id,s,current_session.csrf_token);
 IF p->>'version' IS DISTINCT FROM 'oidc-connection.v1' OR p->>'protocol' IS DISTINCT FROM 'oidc'
 OR p->'config'->>'tenantId' IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'SSO_FORBIDDEN'; END IF;
 INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES(t,c,p);RETURN c;
END $$;
CREATE FUNCTION identity.oidc_link(t uuid,s uuid,u uuid,d char(64),csrf text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope jsonb; BEGIN
 IF s IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM identity.session WHERE id=s AND user_id=u AND token_digest=d AND csrf_token=csrf AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LINK_FORBIDDEN'; END IF;
 scope:=identity.sso_session_scope(s);
 IF scope IS NOT NULL AND (coalesce((scope->>'revoked')::boolean,false) OR scope->>'tenantId' IS DISTINCT FROM t::text) THEN RAISE EXCEPTION 'LINK_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.sso_session_memberships(u,s) m WHERE m.tenant_id=t AND m.identity_user_id=u AND (scope IS NULL OR m.id::text=scope->>'membershipId')) THEN RAISE EXCEPTION 'LINK_FORBIDDEN'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
END $$;
CREATE FUNCTION identity.oidc_save(c uuid,r jsonb,config jsonb,s uuid,u uuid,d char(64),csrf text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE meta jsonb; t uuid; BEGIN
 meta:=identity.sso_load_connection(c);t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF meta IS DISTINCT FROM config OR meta->>'protocol' IS DISTINCT FROM 'oidc' OR r->>'version' IS DISTINCT FROM 'oidc-request.v1'
 OR r->>'tenantId' IS DISTINCT FROM t::text OR r->>'connectionId' IS DISTINCT FROM c::text
 OR r->>'issuer' IS DISTINCT FROM meta->'config'->>'issuer' OR r->>'clientId' IS DISTINCT FROM meta->'config'->>'clientId' OR r->>'redirectUri' IS DISTINCT FROM meta->'config'->>'redirectUri'
 OR (r->>'nonce' ~ '^[A-Za-z0-9_-]{43}$') IS NOT TRUE OR (r->>'verifier' ~ '^[A-Za-z0-9_-]{43}$') IS NOT TRUE OR (r->>'browserBinding' ~ '^[A-Za-z0-9_-]{43}$') IS NOT TRUE
 THEN RAISE EXCEPTION 'REQUEST_REFUSED'; END IF;
 PERFORM identity.oidc_link(t,s,u,d,csrf);
 INSERT INTO identity.oidc_request(tenant_id,connection_id,state,request,configuration,link_session_id,link_user_id,link_digest,link_csrf) VALUES(t,c,r->>'state',r,meta,s,u,d,csrf);
END $$;
CREATE FUNCTION identity.oidc_claim(c uuid,state_value text,browser text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE meta jsonb; t uuid; r identity.oidc_request; BEGIN
 meta:=identity.sso_load_connection(c);t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 UPDATE identity.oidc_request SET status='claimed',claimed_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND state=state_value
 AND status='pending' AND expires_at>clock_timestamp() AND request->>'browserBinding'=browser AND configuration=meta RETURNING * INTO r;
 IF r.state IS NULL THEN RAISE EXCEPTION 'REQUEST_REFUSED'; END IF;
 RETURN jsonb_build_object('connection',r.configuration,'request',r.request,'linkSessionId',r.link_session_id);
END $$;
CREATE FUNCTION identity.oidc_fail(c uuid,state_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; BEGIN
 PERFORM identity.sso_load_connection(c);t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 UPDATE identity.oidc_request SET status='outcome_unknown',finished_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND state=state_value AND status='claimed';
END $$;
-- Restated from 0120: only OIDC replay records use the separate namespace.
-- SAML follows the original raw-ID lookup and insertion, with all historical rows/indexes/grants intact.
CREATE OR REPLACE FUNCTION identity.sso_complete(c uuid,claims jsonb,state char(64),new_session uuid,token char(64),csrf text,expires timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; r identity.sso_request; sub identity.sso_subject; u uuid; member uuid; account uuid; address text:=(claims->>'email'); email_domain text; group_row record; grant_id uuid; grants_count integer:=0; sh char(64):=(claims->>'subjectHash'); eh char(64):=(claims->>'emailHash'); link identity.session; binding jsonb; BEGIN
 binding:=identity.sso_load_connection(c); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
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
 SELECT count(*) INTO grants_count FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'));
 IF sub.user_id IS NOT NULL THEN
  -- Revocation on a verified next sign-in is a committed fact even if no mapped group remains.
  UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id IN(SELECT session_id FROM identity.sso_session_binding WHERE tenant_id=t AND connection_id=c AND subject_hash=sh) AND revoked_at IS NULL;
  INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT t,gen_random_uuid(),g.grant_id FROM identity.sso_grant g
   WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id);
 END IF;
 IF grants_count=0 THEN
  IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
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
CREATE FUNCTION identity.oidc_complete(c uuid,state_value text,claims jsonb,new_session uuid,token char(64),csrf text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; meta jsonb; r identity.oidc_request; result jsonb; sh text; eh text; assertion text; BEGIN
 meta:=identity.sso_load_connection(c);t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
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
 result:=identity.sso_complete(c,jsonb_build_object('assertionId',assertion,'requestId',assertion,'subjectHash',sh,'emailHash',eh,'email',lower(claims->>'email'),'groups',claims->'groups'),eh,new_session,token,csrf,date_trunc('milliseconds',clock_timestamp())+(meta->>'sessionLimitSeconds')::integer*interval '1 second');
 UPDATE identity.oidc_request SET status=CASE WHEN result ? 'code' THEN 'refused' ELSE 'completed' END,finished_at=clock_timestamp() WHERE tenant_id=t AND connection_id=c AND state=state_value;
 RETURN result;
END $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname IN('oidc_create','oidc_link','oidc_save','oidc_claim','oidc_fail','oidc_complete') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity',f);
  IF f <> 'identity.oidc_link(uuid,uuid,uuid,character,text)'::regprocedure THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_identity',f); END IF;
 END LOOP;
END $$;
COMMIT;
