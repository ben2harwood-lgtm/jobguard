BEGIN;
-- Dedicated machine credential, no login or credential installed. Empty means OFF for every tenant.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_scim') THEN
 CREATE ROLE jobguard_scim NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA identity TO jobguard_scim;
CREATE TABLE identity.scim2_binding (
 tenant_id uuid NOT NULL, id uuid NOT NULL UNIQUE, connection_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false, token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id)
);
CREATE TABLE identity.scim2_resource (
 tenant_id uuid NOT NULL, binding_id uuid NOT NULL, id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('Users','Groups')),
 revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL, membership_id uuid, deleted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,binding_id,id), FOREIGN KEY(tenant_id,binding_id) REFERENCES identity.scim2_binding(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((kind='Users')=(membership_id IS NOT NULL))
);
CREATE TABLE identity.scim2_receipt (
 tenant_id uuid NOT NULL, binding_id uuid NOT NULL, id uuid NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY(tenant_id,binding_id,id), FOREIGN KEY(tenant_id,binding_id) REFERENCES identity.scim2_binding(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['scim2_binding','scim2_resource','scim2_receipt'] LOOP
  EXECUTE format('ALTER TABLE identity.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON identity.%I TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure,jobguard_scim',n);
 END LOOP;
END $$;
-- Narrow bootstrap lookup, just like connector.binding: selects only the secret-named binding, never business rows.
CREATE POLICY binding_lookup ON identity.scim2_binding FOR SELECT TO jobguard_migration
 USING(id=nullif(current_setting('app.scim2_binding',true),'')::uuid);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.scim2_receipt FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE FUNCTION identity.scim2_configure(s text, csrf text, t uuid, b uuid, c uuid, is_enabled boolean, credential_hash text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 a:=identity.emergency_owner(s,csrf,t);
 IF credential_hash IS NULL OR credential_hash !~ '^[a-f0-9]{64}$' OR is_enabled IS NULL
 OR NOT EXISTS(SELECT 1 FROM identity.sso_connection WHERE tenant_id=t AND id=c)
 THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO identity.scim2_binding VALUES(t,b,c,is_enabled,credential_hash,clock_timestamp()+interval '1 day')
 ON CONFLICT(tenant_id,id) DO UPDATE SET enabled=EXCLUDED.enabled,token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at
 WHERE scim2_binding.connection_id=EXCLUDED.connection_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.ef_audit(a,'sso.scim.configured','scim_binding',b,jsonb_build_object('references',jsonb_build_object('bindingId',b::text),
  'classifications',jsonb_build_object('data','security')));
END $$;
CREATE FUNCTION identity.scim2_audit(a uuid,p_type text,p_subject_type text,p_subject uuid,payload jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; seq bigint; prev text; ts timestamptz; ph text; eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'machine:scim:'||a::text,p_type,p_subject_type,p_subject::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','machine:scim:'||a::text,p_type,p_subject_type,p_subject::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
ALTER FUNCTION identity.scim2_audit(uuid,text,text,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.scim2_audit(uuid,text,text,uuid,jsonb) FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure,jobguard_scim;
CREATE FUNCTION identity.scim2_machine(b uuid, token text, p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding identity.scim2_binding; t uuid; old identity.scim2_resource; rid uuid; event uuid;
 resource_kind text:=p->>'kind'; method text:=p->>'method'; doc jsonb:=p->'document'; result jsonb; previous identity.scim2_receipt;
 actor uuid; person uuid; member uuid; account uuid; address text; sh text; response jsonb; request_hash text;
 entry jsonb; rev integer; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id','',true);
 PERFORM set_config('app.scim2_binding',b::text,true);
 SELECT * INTO binding FROM identity.scim2_binding WHERE id=b;
 PERFORM set_config('app.scim2_binding','',true);
 IF binding.id IS NULL OR token IS NULL OR binding.token_hash IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
 OR NOT binding.enabled OR binding.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SCIM_REFUSED' USING ERRCODE='42501'; END IF;
 t:=binding.tenant_id;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Recheck after serializing with rotation/disabling; do not cache authorization before the lock.
 SELECT * INTO binding FROM identity.scim2_binding WHERE tenant_id=t AND id=b FOR SHARE;
 IF NOT binding.enabled OR binding.expires_at<=clock_timestamp() OR binding.token_hash IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
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
  PERFORM identity.scim2_audit(b,'sso.scim.get','scim_binding',b,
   jsonb_build_object('classifications',jsonb_build_object('data','security')));
  RETURN response;
 END IF;
 event:=(p->>'eventId')::uuid;
 IF event IS NULL OR rid IS NULL THEN RAISE EXCEPTION 'SCIM_INVALID' USING ERRCODE='22023'; END IF;
 request_hash:=app.final_lock_hash(p);
 SELECT * INTO previous FROM identity.scim2_receipt WHERE tenant_id=t AND binding_id=b AND id=event;
 IF FOUND THEN
  IF previous.request_hash<>request_hash THEN RAISE EXCEPTION 'SCIM_CONFLICT' USING ERRCODE='23505'; END IF;
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
 PERFORM identity.scim2_audit(b,'sso.scim.'||lower(method),'scim_binding',b,
  jsonb_build_object('references',jsonb_build_object('bindingId',b::text,'machine','scim2'),
  'hashes',jsonb_build_object('request',request_hash),'classifications',jsonb_build_object('data','security')));
 RETURN response;
END $$;
ALTER FUNCTION identity.scim2_configure(text,text,uuid,uuid,uuid,boolean,text) OWNER TO jobguard_migration;
ALTER FUNCTION identity.scim2_machine(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.scim2_configure(text,text,uuid,uuid,uuid,boolean,text) FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure,jobguard_scim;
REVOKE ALL ON FUNCTION identity.scim2_machine(uuid,text,jsonb) FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure,jobguard_scim;
GRANT EXECUTE ON FUNCTION identity.scim2_configure(text,text,uuid,uuid,uuid,boolean,text) TO jobguard_identity;
GRANT EXECUTE ON FUNCTION identity.scim2_machine(uuid,text,jsonb) TO jobguard_scim;
COMMIT;
