BEGIN;
-- Private identity/control-plane associations, never business rows or credentials
-- in the identity tenant. Namespace digests are explicitly NON-CREDENTIALS.
CREATE TABLE control_plane.identity_practice_namespace (
 owner_digest char(64) PRIMARY KEY REFERENCES control_plane.practice_session(token_digest) DEFERRABLE INITIALLY DEFERRED,
 identity_tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 UNIQUE(identity_tenant_id,owner_digest)
);
CREATE TABLE control_plane.identity_practice_company (
 identity_tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
 owner_digest char(64) NOT NULL,
 FOREIGN KEY(identity_tenant_id,owner_digest) REFERENCES control_plane.identity_practice_namespace(identity_tenant_id,owner_digest)
);
CREATE TABLE control_plane.identity_practice_credential (
 token_digest char(64) PRIMARY KEY REFERENCES control_plane.practice_session(token_digest) DEFERRABLE INITIALLY DEFERRED,
 parent_session_id uuid NOT NULL REFERENCES identity.session(id),
 identity_tenant_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 owner_digest char(64) NOT NULL,
 FOREIGN KEY(identity_tenant_id,membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(identity_tenant_id,owner_digest) REFERENCES control_plane.identity_practice_namespace(identity_tenant_id,owner_digest),
 CHECK(token_digest<>owner_digest)
);
ALTER TABLE control_plane.identity_practice_namespace OWNER TO jobguard_migration;
ALTER TABLE control_plane.identity_practice_company OWNER TO jobguard_migration;
ALTER TABLE control_plane.identity_practice_credential OWNER TO jobguard_migration;
ALTER TABLE control_plane.identity_practice_namespace ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.identity_practice_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.identity_practice_credential ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON control_plane.identity_practice_namespace,control_plane.identity_practice_company,
 control_plane.identity_practice_credential FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Lock order: tenant-54 shared (administration uses exclusive), parent SHARE,
-- exact membership SHARE, company association, namespace, credential. The
-- discovery reads are not authority; all mutable facts are checked after waits.
CREATE FUNCTION app.linked_practice_parent(d text)
 RETURNS TABLE(parent_id uuid,identity_tenant uuid,owner_membership uuid,deadline timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s identity.session; m record; scope jsonb; n integer; t uuid; member uuid;
 saved_tenant text:=current_setting('app.tenant_id',true); saved_sso text:=current_setting('app.sso_session_id',true);
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
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM 1 FROM identity.membership_locator WHERE user_id=s.user_id AND tenant_id=t FOR SHARE;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=member FOR SHARE;
 -- Fresh reads after ALL waits; scope/effective membership are not replaced by
 -- the row lock. This also rejects contractor revocation and SSO restrictions.
 SELECT * INTO s FROM identity.session WHERE id=s.id;
 scope:=identity.sso_session_scope(s.id);
 SELECT count(*) INTO n FROM identity.sso_session_memberships(s.user_id,s.id) e
 WHERE scope IS NULL OR (coalesce((scope->>'revoked')::boolean,false)=false
  AND e.tenant_id::text=scope->>'tenantId' AND e.id::text=scope->>'membershipId');
 SELECT * INTO m FROM identity.sso_session_memberships(s.user_id,s.id) e WHERE e.id=member AND e.tenant_id=t;
 PERFORM set_config('app.tenant_id',t::text,true);
 IF s.environment<>'synthetic_demo' OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp()
  OR n<>1 OR m.id IS NULL OR m.role<>'owner' OR NOT EXISTS(
   SELECT 1 FROM app.membership a WHERE (a.tenant_id,a.id,a.identity_user_id)=(t,member,s.user_id)
    AND a.role='owner' AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(t,member)))
 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT least(s.expires_at,coalesce(a.expires_at,'infinity')) INTO deadline
 FROM app.membership a WHERE (a.tenant_id,a.id)=(t,member);
 parent_id:=s.id; identity_tenant:=t; owner_membership:=member;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN NEXT;
END $$;

CREATE FUNCTION app.linked_practice_authority(d text)
 RETURNS TABLE(owner_digest text,deadline timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c control_plane.identity_practice_credential; p record; parent_digest text; active text;
 ns control_plane.practice_session; credential control_plane.practice_session;
BEGIN
 SELECT * INTO c FROM control_plane.identity_practice_credential WHERE token_digest=d;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT token_digest INTO parent_digest FROM identity.session WHERE id=c.parent_session_id;
 SELECT * INTO p FROM app.linked_practice_parent(parent_digest);
 IF (p.parent_id,p.identity_tenant,p.owner_membership) IS DISTINCT FROM
  (c.parent_session_id,c.identity_tenant_id,c.membership_id) THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT x.owner_digest INTO active FROM control_plane.identity_practice_company x
  WHERE x.identity_tenant_id=c.identity_tenant_id FOR SHARE;
 SELECT * INTO ns FROM control_plane.practice_session WHERE token_digest=c.owner_digest FOR SHARE;
 SELECT * INTO credential FROM control_plane.practice_session WHERE token_digest=d FOR SHARE;
 IF active IS DISTINCT FROM c.owner_digest::text OR ns.revoked_at IS NOT NULL
  OR ns.environment IS DISTINCT FROM 'synthetic_demo' OR ns.expires_at<=clock_timestamp()
  OR credential.revoked_at IS NOT NULL OR credential.environment IS DISTINCT FROM 'synthetic_demo'
  OR credential.expires_at<=clock_timestamp() OR p.deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 RETURN QUERY SELECT c.owner_digest::text,least(p.deadline,ns.expires_at,credential.expires_at);
END $$;

-- Only this binding-owner helper can inspect the protected request store.
-- No authentication call here: canonical-owner authentication must not recurse.
CREATE FUNCTION app.linked_practice_bound_owner(d text,t uuid) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding;
BEGIN
 b:=app.lp6_bound_request();
 RETURN b.credential_kind='practice' AND b.tenant_id=t
  AND t='11111111-1111-4111-8111-111111111111'::uuid
  AND b.session_ref=encode(sha256(convert_to('lp6-home:'||d,'UTF8')),'hex');
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
ALTER FUNCTION app.linked_practice_bound_owner(text,uuid) OWNER TO jobguard_binding_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.linked_practice_bound_owner(text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.linked_practice_bound_owner(text,uuid) TO jobguard_migration;
CREATE FUNCTION app.anonymous_practice_authority(digest text, requested_tenant uuid DEFAULT '11111111-1111-4111-8111-111111111111'::uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('app.evidence_pack_approval_fence',true)='on' THEN
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM requested_tenant::text THEN RETURN; END IF;
 -- Lock order: session, then the fixed practice membership. Lock by identity
 -- first; evaluate mutable permission/deadlines in a fresh statement after ALL
 -- waits so neither a committed revocation nor elapsed expiry is overlooked.
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=digest FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 -- FOR SHARE uses the tenant's existing UPDATE RLS policy. The approval path
 -- above requires that matching context; no bootstrap RLS policy is expanded.
  PERFORM 1 FROM app.membership m WHERE m.tenant_id=requested_tenant
   AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
   AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
 END IF;
 RETURN QUERY
 SELECT m.tenant_id,m.id,m.identity_user_id FROM control_plane.practice_session s
 JOIN app.membership m ON m.tenant_id=requested_tenant
  AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
  AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
 WHERE s.token_digest=digest AND s.environment='synthetic_demo'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION app.authenticate_practice_session(digest text, requested_tenant uuid DEFAULT '11111111-1111-4111-8111-111111111111'::uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE linked boolean;
BEGIN
 linked:=EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest=digest);
 IF linked THEN
  IF requested_tenant IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN RETURN; END IF;
  PERFORM 1 FROM app.linked_practice_authority(digest);
 ELSIF EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest=digest) THEN
  IF NOT app.linked_practice_bound_owner(digest,requested_tenant) THEN RETURN; END IF;
 END IF;
 RETURN QUERY SELECT * FROM app.anonymous_practice_authority(digest,requested_tenant);
END $$;

CREATE FUNCTION app.practice_owner_digest(d text,t uuid DEFAULT '11111111-1111-4111-8111-111111111111'::uuid) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t)) THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT c.owner_digest INTO owner FROM control_plane.identity_practice_credential c WHERE c.token_digest=d;
 RETURN coalesce(owner,d);
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
  PERFORM set_config('app.tenant_id',p_tenant::text,true);
  -- A switch must not revive the base owner's revoked or expired membership.
  IF NOT EXISTS(SELECT 1 FROM app.membership base
   WHERE (base.tenant_id,base.id,base.identity_user_id)=(p_tenant,practice.membership_id,practice.identity_user_id)
    AND base.revoked_at IS NULL AND (base.expires_at IS NULL OR base.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(base.tenant_id,base.id))) THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM app.contractor_session(p_credential::uuid) effective
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
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN QUERY SELECT selected_ref,selected_actor,deadline;
END $$;

-- Versioned entry/reset accepts an already HMAC-authenticated identity digest,
-- never a browser tenant or owner selector. Only the identity role may invoke it.
CREATE FUNCTION identity.enter_linked_practice(parent_digest text,new_digest text,command jsonb,current_digest text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p record; active text; next_owner text; prior record;
BEGIN
 IF command IS NULL OR command NOT IN (
  '{"version":"linked-practice-company.v1","action":"enter"}'::jsonb,
  '{"version":"linked-practice-company.v1","action":"reset"}'::jsonb)
  OR new_digest IS NULL OR new_digest !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 SELECT * INTO p FROM app.linked_practice_parent(parent_digest);
 -- Serialize absence as well as the existing association. Parent/member locks
 -- precede this key; reset never locks another device's parent or credential.
 PERFORM pg_advisory_xact_lock(hashtextextended(p.identity_tenant::text,942));
 SELECT owner_digest INTO active FROM control_plane.identity_practice_company
  WHERE identity_tenant_id=p.identity_tenant FOR UPDATE;
 IF command->>'action'='reset' THEN
  SELECT * INTO prior FROM control_plane.identity_practice_credential WHERE token_digest=current_digest;
  IF prior.parent_session_id IS DISTINCT FROM p.parent_id OR prior.membership_id IS DISTINCT FROM p.owner_membership
   OR prior.identity_tenant_id IS DISTINCT FROM p.identity_tenant OR prior.owner_digest::text IS DISTINCT FROM active THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  -- Association is already exclusive; validate all lifecycle facts again.
  PERFORM 1 FROM app.linked_practice_authority(current_digest);
  PERFORM 1 FROM control_plane.practice_session WHERE token_digest=active FOR UPDATE;
 ELSIF current_digest IS NOT NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 IF active IS NULL OR command->>'action'='reset' THEN
  next_owner:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  -- Private markers MUST precede practice_session INSERT (deferred FK).
  INSERT INTO control_plane.identity_practice_namespace VALUES(next_owner,p.identity_tenant);
  INSERT INTO control_plane.blank_practice_session(token_digest) VALUES(next_owner);
  INSERT INTO control_plane.practice_session(token_digest,expires_at) VALUES(next_owner,'infinity');
  INSERT INTO control_plane.identity_practice_company VALUES(p.identity_tenant,next_owner)
   ON CONFLICT(identity_tenant_id) DO UPDATE SET owner_digest=excluded.owner_digest;
  IF active IS NOT NULL THEN
   UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=active;
   UPDATE control_plane.blank_practice_session SET replaced_by=next_owner WHERE token_digest=active;
  END IF;
  active:=next_owner;
 END IF;
 INSERT INTO control_plane.identity_practice_credential VALUES(new_digest,p.parent_id,p.identity_tenant,p.owner_membership,active);
 INSERT INTO control_plane.practice_session(token_digest,expires_at) VALUES(new_digest,least(p.deadline,clock_timestamp()+interval '7 days'));
END $$;

CREATE OR REPLACE FUNCTION app.is_blank_practice_company(digest text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN false; END IF;
 -- Linked ownership is resolved via the validated credential or protected binding.
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest)) THEN RETURN false; END IF;
 SELECT c.owner_digest INTO owner FROM control_plane.identity_practice_credential c WHERE c.token_digest=digest;
 RETURN EXISTS(SELECT 1 FROM control_plane.blank_practice_session b WHERE b.token_digest=coalesce(owner,digest));
EXCEPTION WHEN invalid_authorization_specification THEN RETURN false;
END $$;

-- Full latest legacy bodies with the same private marker guards as the original
-- overlays. CREATE OR REPLACE preserves existing owners, signatures and grants.
CREATE OR REPLACE FUNCTION app.seed_saved_v1_sample() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE tenant uuid:='11111111-1111-4111-8111-111111111111'; j uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); proposal_id uuid:=gen_random_uuid(); scope uuid; line jsonb; lines jsonb:='[]'; data jsonb; label text; i integer:=0; text_value text:='Generated fictional v1 decorating sample. No real customer data.'; previous_context text;
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest=NEW.token_digest)
  OR EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest=NEW.token_digest)
 THEN RETURN NEW; END IF;

 IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'session fixture requires migration owner' USING ERRCODE='42501'; END IF;
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

CREATE OR REPLACE FUNCTION app.issue_practice_session(digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog AS $$
DECLARE j uuid; item record; t uuid:='11111111-1111-4111-8111-111111111111';
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest IN (digest))
 OR EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest IN (digest)) THEN
 RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF digest IS NULL OR digest !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid
   AND m.id='d1500000-0000-4000-8000-000000000003'::uuid AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
   AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ) THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.practice_session(token_digest) VALUES(digest);
 PERFORM set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
 FOR item IN SELECT * FROM (VALUES('Practice kitchen','quoting'),('Kitchen extension','live'),('Loft conversion','quoting')) AS recipe(title,status) LOOP
  j:=gen_random_uuid();
  INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
  VALUES(t,j,pg_backend_pid(),pg_current_xact_id(),'practice_home',
   app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',t,'id',j,'title',item.title,
    'status',item.status,'revision',0,'provenance','system_generated_quote','practice_session_digest',digest,'practice_scenario','home'))),
   'd1500000-0000-4000-8000-000000000003');
  INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES(j,t,item.title,item.status,digest,'home');
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app.start_blank_practice_company(digest text, previous_digest text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest IN (digest,previous_digest))
 OR EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest IN (digest,previous_digest)) THEN
 RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF digest IS NULL OR digest !~ '^[0-9a-f]{64}$' OR digest IS NOT DISTINCT FROM previous_digest THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
 END IF;
 IF previous_digest IS NOT NULL THEN
  -- Reset owns only the presented live blank session. Recheck after waiting;
  -- parallel resets cannot both succeed. Retain old jobs, sources and audit.
  PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=previous_digest FOR UPDATE;
  IF NOT app.is_blank_practice_company(previous_digest) THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.membership m
   WHERE m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid
    AND m.id='d1500000-0000-4000-8000-000000000003'::uuid
    AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
    AND m.role='owner' AND m.revoked_at IS NULL
    AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
  END IF;
 END IF;
 INSERT INTO control_plane.blank_practice_session(token_digest) VALUES(digest);
 INSERT INTO control_plane.practice_session(token_digest) VALUES(digest);
 IF previous_digest IS NOT NULL THEN
  UPDATE control_plane.practice_session SET revoked_at=clock_timestamp()
   WHERE token_digest=previous_digest;
  UPDATE control_plane.blank_practice_session SET replaced_by=digest WHERE token_digest=previous_digest;
 END IF;
 -- Deliberately no seeded jobs and no business-data deletes.
END $$;

CREATE OR REPLACE FUNCTION app.start_blank_practice_company_v2(new_token text, previous_token text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 digest text;
 previous_digest text;
 token_pattern constant text := '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.identity_practice_namespace WHERE owner_digest IN (encode(sha256(convert_to(new_token,'UTF8')),'hex'),encode(sha256(convert_to(previous_token,'UTF8')),'hex')))
 OR EXISTS(SELECT 1 FROM control_plane.identity_practice_credential WHERE token_digest IN (encode(sha256(convert_to(new_token,'UTF8')),'hex'),encode(sha256(convert_to(previous_token,'UTF8')),'hex'))) THEN
 RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Match practiceSessionV1 (Zod UUID); do not accept stored SHA-256 digests.
 IF new_token IS NULL OR length(new_token)<>36 OR new_token !~ token_pattern
  OR (previous_token IS NOT NULL AND (length(previous_token)<>36 OR previous_token !~ token_pattern)) THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
 END IF;
 digest := encode(sha256(convert_to(new_token,'UTF8')),'hex');
 previous_digest := CASE WHEN previous_token IS NULL THEN NULL
  ELSE encode(sha256(convert_to(previous_token,'UTF8')),'hex') END;
 IF digest IS NOT DISTINCT FROM previous_digest THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
 END IF;
 IF previous_digest IS NOT NULL THEN
  -- Reset owns only the presented live blank session. Recheck after waiting;
  -- parallel resets cannot both succeed. Retain old jobs, sources and audit.
  PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=previous_digest FOR UPDATE;
  IF NOT app.is_blank_practice_company(previous_digest) THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.membership m
   WHERE m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid
    AND m.id='d1500000-0000-4000-8000-000000000003'::uuid
    AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
    AND m.role='owner' AND m.revoked_at IS NULL
    AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
  END IF;
 END IF;
 INSERT INTO control_plane.blank_practice_session(token_digest) VALUES(digest);
 INSERT INTO control_plane.practice_session(token_digest) VALUES(digest);
 IF previous_digest IS NOT NULL THEN
  UPDATE control_plane.practice_session SET revoked_at=clock_timestamp()
   WHERE token_digest=previous_digest;
  UPDATE control_plane.blank_practice_session SET replaced_by=digest WHERE token_digest=previous_digest;
 END IF;
 -- Deliberately no seeded jobs and no business-data deletes.
END $$;

ALTER FUNCTION app.linked_practice_parent(text) OWNER TO jobguard_migration;
ALTER FUNCTION app.linked_practice_authority(text) OWNER TO jobguard_migration;
ALTER FUNCTION app.anonymous_practice_authority(text,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.practice_owner_digest(text,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION identity.enter_linked_practice(text,text,jsonb,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.linked_practice_parent(text),app.linked_practice_authority(text),
 app.anonymous_practice_authority(text,uuid),app.practice_owner_digest(text,uuid),
 identity.enter_linked_practice(text,text,jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.practice_owner_digest(text,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION identity.enter_linked_practice(text,text,jsonb,text) TO jobguard_identity;
COMMIT;
